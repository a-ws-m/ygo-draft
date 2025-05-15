# AVIF Image Conversion Solution

This solution provides efficient AVIF image conversion for the YGO Draft application using AWS Lambda and S3, integrated with Supabase edge functions.

## Using Sharp AWS Layer

This solution can use the [Sharp AWS Layer](https://github.com/pH200/sharp-layer) from pH200 instead of bundling Sharp with the Lambda function. This provides the following benefits:

- Significantly smaller deployment package
- Faster cold start times
- Easier updates to Sharp without redeploying the function
- No need to compile Sharp for Lambda's environment

To set up the Sharp Layer, run:
```bash
make setup-sharp-layer
```

This will:
1. Update your Terraform configuration to use the Sharp Layer
2. Remove Sharp from your package.json dependencies
3. Keep your Lambda function code unchanged since it's compatible with both approaches

## Fixed Package.json Issue

The initial package.json contained a recursive dependency with `"convert-to-avif": "link:"` which caused the npm error:
```
npm error Unsupported URL Type "link:": link:
```

This has been fixed by removing the self-referencing dependency.

## Deployment Options

### Option 1: Quick Deployment with the Script

The easiest way to deploy this Lambda function is using the provided deployment script:

```bash
# Navigate to the function directory
cd /home/awsm/dev/ygo-draft/aws/lambda/convert-to-avif

# Run the deployment script
./deploy.sh
```

The script will:
1. Build and package the Lambda function
2. Ask if you want to deploy with Terraform or AWS CLI
3. Create or update all necessary AWS resources
4. Optionally update your Supabase environment variables
5. Optionally deploy the Supabase adapter function

### Option 2: Manual Deployment with AWS CLI

If you prefer to deploy manually with AWS CLI:

```bash
# Build the Lambda package
npm run build
npm run package

# Update an existing Lambda function
aws lambda update-function-code \
  --function-name convert-to-avif \
  --zip-file fileb://convert-to-avif.zip

# Or create a new Lambda function
aws lambda create-function \
  --function-name convert-to-avif \
  --runtime nodejs18.x \
  --role arn:aws:iam::<YOUR_ACCOUNT_ID>:role/ygo_avif_converter_lambda_role \
  --handler index.handler \
  --zip-file fileb://convert-to-avif.zip \
  --timeout 30 \
  --memory-size 1024 \
  --environment "Variables={OUTPUT_BUCKET=ygo-card-images-avif}"
```

### Option 3: Deployment with Terraform

To deploy using Terraform:

```bash
# Build the Lambda package first
npm run build
npm run package

# Initialize Terraform
terraform init

# Plan the deployment
terraform plan

# Apply the changes
terraform apply
```

## Testing the Lambda Function

Use the provided test script to verify your Lambda deployment:

```bash
./test-lambda.sh <API_URL>
```

For example:
```bash
./test-lambda.sh https://abc123def.execute-api.us-east-1.amazonaws.com/convert
```

This will:
1. Create a test image (or use an existing one)
2. Send it to your Lambda function for AVIF conversion
3. Download and verify the converted image
4. Compare file sizes to demonstrate compression benefits

## Configuring Supabase to Use the Lambda

After deployment, update your Supabase environment variables:

```bash
supabase secrets set AWS_LAMBDA_URL="https://<YOUR_API_ID>.execute-api.<REGION>.amazonaws.com/convert"
supabase secrets set AWS_REGION="<YOUR_AWS_REGION>"
supabase secrets set AWS_ACCESS_KEY_ID="<YOUR_ACCESS_KEY>"
supabase secrets set AWS_SECRET_ACCESS_KEY="<YOUR_SECRET_KEY>"
```

Then deploy the Supabase adapter function:

```bash
cd ~/dev/ygo-draft/supabase/functions/convert-to-avif
supabase functions deploy convert-to-avif
```

## Architecture Overview

```
┌────────────────┐    ┌───────────────────┐    ┌───────────────────┐
│ Supabase Edge  │    │  AWS Lambda       │    │     AWS S3        │
│  Function      │───►│ Image Converter   │───►│  Storage Bucket   │
│(convert-to-avif)    │(convert-to-avif)  │    │(ygo-card-images)  │
└────────────────┘    └───────────────────┘    └───────────────────┘
         ▲                                              │
         │                                              │
         │                                              ▼
┌────────────────┐                            ┌───────────────────┐
│ Supabase Edge  │                            │ CDN/Client Access │
│  Function      │◄───────────────────────────│ to Optimized      │
│(fetch-card-     │                           │ Images            │
│  images)       │                            └───────────────────┘
└────────────────┘
```
