#!/bin/zsh

set -e

echo "🚀 Starting AVIF Converter Lambda Deployment"

# Directory check
if [[ ! -f ./index.js || ! -f ./package.json ]]; then
  echo "❌ Error: Must be run from the card-image-processor directory"
  exit 1
fi

# Function to ask y/n question
confirm() {
  read -q "REPLY?$1 (y/n) "
  echo ""
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    return 0
  else
    return 1
  fi
}

# Build the Lambda package
build_package() {
  echo "📦 Building Lambda package..."
  npm run build
  npm run package
  echo "✅ Package built successfully"
}

# Terraform deployment
deploy_with_terraform() {
  echo "🏗️ Deploying with Terraform..."
  
  if ! command -v terraform &> /dev/null; then
    echo "❌ Error: terraform not found. Please install Terraform."
    exit 1
  fi
  
  # Initialize Terraform
  terraform init
  
  # Plan and apply if confirmed
  terraform plan
  
  if confirm "Would you like to apply this Terraform plan?"; then
    terraform apply -auto-approve
    
    # Output the API URL
    API_URL=$(terraform output -raw api_url)
    echo "🔗 API URL: $API_URL"
    
    # Force update the Lambda function code regardless of Terraform state
    echo "🔄 Forcing update of Lambda code..."
    
    # Try to get region from Terraform output, fall back to AWS CLI config if not available
    AWS_REGION=$(terraform output -raw aws_region 2>/dev/null || aws configure get region)
    
    aws lambda update-function-code \
      --region $AWS_REGION \
      --function-name card-image-processor \
      --zip-file fileb://card-image-processor.zip
  else
    echo "❌ Terraform apply cancelled"
    exit 1
  fi
}

# AWS CLI deployment
deploy_with_awscli() {
  echo "🏗️ Deploying with AWS CLI..."
  
  if ! command -v aws &> /dev/null; then
    echo "❌ Error: AWS CLI not found. Please install AWS CLI."
    exit 1
  fi
  
  # Check if the lambda function exists
  aws lambda get-function --function-name card-image-processor &> /dev/null
  FUNCTION_EXISTS=$?
  
  if [ $FUNCTION_EXISTS -eq 0 ]; then
    echo "🔄 Updating existing Lambda function..."
    aws lambda update-function-code \
      --function-name card-image-processor \
      --zip-file fileb://card-image-processor.zip
  else
    echo "🆕 Creating new Lambda function..."
    
    # Check if the IAM role exists
    aws iam get-role --role-name ygo_avif_converter_lambda_role &> /dev/null
    ROLE_EXISTS=$?
    
    if [ $ROLE_EXISTS -ne 0 ]; then
      echo "Creating IAM role and policy..."
      # Create a trust policy file
      cat > trust-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

      # Create the role
      aws iam create-role \
        --role-name ygo_avif_converter_lambda_role \
        --assume-role-policy-document file://trust-policy.json

      # Create a permissions policy file
      cat > permissions-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::ygo-card-images-avif",
        "arn:aws:s3:::ygo-card-images-avif/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    }
  ]
}
EOF

      # Attach the policy to the role
      aws iam put-role-policy \
        --role-name ygo_avif_converter_lambda_role \
        --policy-name S3AndLogsAccess \
        --policy-document file://permissions-policy.json
      
      echo "Waiting for role to propagate (30 seconds)..."
      sleep 30
    fi
    
    # Get role ARN
    ROLE_ARN=$(aws iam get-role --role-name ygo_avif_converter_lambda_role --query 'Role.Arn' --output text)
    
    # Check if the S3 bucket exists
    aws s3api head-bucket --bucket ygo-card-images-avif 2>/dev/null
    BUCKET_EXISTS=$?
    
    if [ $BUCKET_EXISTS -ne 0 ]; then
      echo "Creating S3 bucket..."
      REGION=$(aws configure get region)
      if [ "$REGION" = "us-east-1" ]; then
        aws s3api create-bucket --bucket ygo-card-images-avif
      else
        aws s3api create-bucket --bucket ygo-card-images-avif --region $REGION --create-bucket-configuration LocationConstraint=$REGION
      fi
      
      # Set CORS configuration
      cat > cors.json << 'EOF'
{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET"],
      "AllowedOrigins": ["*"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3000
    }
  ]
}
EOF

      aws s3api put-bucket-cors --bucket ygo-card-images-avif --cors-configuration file://cors.json
    fi
    
    # Create Lambda function
    aws lambda create-function \
      --function-name card-image-processor \
      --runtime nodejs18.x \
      --role $ROLE_ARN \
      --handler index.handler \
      --zip-file fileb://card-image-processor.zip \
      --timeout 30 \
      --memory-size 1024 \
      --environment "Variables={OUTPUT_BUCKET=ygo-card-images-avif}"
      
    # Create API Gateway if needed
    if confirm "Would you like to create an API Gateway for this Lambda?"; then
      echo "Creating API Gateway..."
      
      # Create HTTP API
      API_ID=$(aws apigatewayv2 create-api \
        --name "Card Image Processor API" \
        --protocol-type HTTP \
        --target "arn:aws:lambda:$(aws configure get region):$(aws sts get-caller-identity --query 'Account' --output text):function:card-image-processor" \
        --query "ApiId" \
        --output text)
      
      echo "Created API Gateway with ID: $API_ID"
      
      # Give API Gateway permission to invoke Lambda
      aws lambda add-permission \
        --function-name card-image-processor \
        --statement-id apigateway-invoke \
        --action lambda:InvokeFunction \
        --principal apigateway.amazonaws.com \
        --source-arn "arn:aws:execute-api:$(aws configure get region):$(aws sts get-caller-identity --query 'Account' --output text):$API_ID/*/*/*"
        
      # Output API URL
      REGION=$(aws configure get region)
      echo "🔗 API URL: https://$API_ID.execute-api.$REGION.amazonaws.com"
    fi
  fi
  
  echo "✅ AWS CLI deployment completed"
}

# Main deployment logic
build_package

if confirm "Would you like to deploy with Terraform? (No will use AWS CLI directly)"; then
  deploy_with_terraform
else
  deploy_with_awscli
fi

echo "🎉 Deployment completed successfully!"

# Update Supabase environment variables
if confirm "Would you like to update Supabase environment variables?"; then
  echo "Please enter the Lambda API URL:"
  read LAMBDA_URL
  
  echo "Setting Supabase environment variables..."
  REGION=$(aws configure get region)
  AWS_ACCESS_KEY=$(aws configure get aws_access_key_id)
  AWS_SECRET_KEY=$(aws configure get aws_secret_access_key)
  
  cd ../../../
  
  pnpm exec supabase secrets set AWS_LAMBDA_URL=$LAMBDA_URL
  pnpm exec supabase secrets set AWS_REGION=$REGION
  pnpm exec supabase secrets set AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY
  pnpm exec supabase secrets set AWS_SECRET_ACCESS_KEY=$AWS_SECRET_KEY
  
  echo "✅ Environment variables updated"
  
  if confirm "Would you like to deploy the Supabase adapter function?"; then
    cd supabase/functions/card-image-processor
    pnpm exec supabase functions deploy card-image-processor
    echo "✅ Supabase adapter function deployed"
  fi
fi

echo "🎉 All done! Your card image processor is ready to use."
