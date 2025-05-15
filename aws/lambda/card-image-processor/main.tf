provider "aws" {
  region = var.aws_region
}

# Lambda function for card image processing and storage
resource "aws_lambda_function" "card_image_processor" {
  function_name    = "card-image-processor"
  filename         = "card-image-processor.zip"
  handler          = "index.handler"
  runtime          = "nodejs18.x"
  role             = aws_iam_role.lambda_exec.arn
  timeout          = 60   # Increased timeout to 60 seconds
  memory_size      = 1024 # Higher memory allocation for image processing

  environment {
    variables = {
      OUTPUT_BUCKET = aws_s3_bucket.card_images.bucket
    }
  }
}

# S3 bucket for storing card images (in AVIF format)
resource "aws_s3_bucket" "card_images" {
  bucket = var.s3_bucket_name
}

# Configure S3 bucket as publicly readable
resource "aws_s3_bucket_public_access_block" "public_access" {
  bucket = aws_s3_bucket.card_images.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

# Make bucket content publicly accessible
resource "aws_s3_bucket_policy" "public_read_policy" {
  bucket = aws_s3_bucket.card_images.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Principal = "*"
        Action = [
          "s3:GetObject"
        ]
        Effect = "Allow"
        Resource = [
          "${aws_s3_bucket.card_images.arn}/*"
        ]
      }
    ]
  })

  # Ensure public access block is configured before applying policy
  depends_on = [aws_s3_bucket_public_access_block.public_access]
}

# Configure S3 bucket lifecycle rule - now we store images indefinitely (no expiration)
resource "aws_s3_bucket_lifecycle_configuration" "manage_objects" {
  bucket = aws_s3_bucket.card_images.id

  rule {
    id     = "archive-after-90-days"
    status = "Enabled"
    
    # Filter with prefix to match all objects
    filter {
      prefix = ""
    }

    # Transition to cheaper storage class after 90 days
    transition {
      days          = 90
      storage_class = "STANDARD_IA"
    }
  }
}

# S3 bucket for CORS configuration to allow front-end access
resource "aws_s3_bucket_cors_configuration" "cors_config" {
  bucket = aws_s3_bucket.card_images.bucket

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD"]
    allowed_origins = ["*"] # Restrict to your domains in production
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

# IAM role for Lambda
resource "aws_iam_role" "lambda_exec" {
  name = "ygo_card_image_processor_lambda_role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

# IAM policy for Lambda to access S3
resource "aws_iam_policy" "lambda_s3_policy" {
  name        = "ygo_card_image_processor_s3_policy"
  description = "Policy to allow Lambda to access S3 bucket"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.card_images.arn,
          "${aws_s3_bucket.card_images.arn}/*"
        ]
      },
      {
        Effect   = "Allow"
        Action   = [
          "s3:GetObject"
        ]
        Resource = "arn:aws:s3:::*/*"  # Allow reading from any S3 bucket
      },
      {
        Effect   = "Allow"
        Action   = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      }
    ]
  })
}

# Attach the policy to the Lambda role
resource "aws_iam_role_policy_attachment" "lambda_s3" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = aws_iam_policy.lambda_s3_policy.arn
}

# API Gateway for the Lambda function
resource "aws_apigatewayv2_api" "api" {
  name          = "card-image-processor-api"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_apigatewayv2_integration" "lambda_integration" {
  api_id                 = aws_apigatewayv2_api.api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.card_image_processor.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "default_route" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "POST /process"
  target    = "integrations/${aws_apigatewayv2_integration.lambda_integration.id}"
}

resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.card_image_processor.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*/process"
}

# Output the API Gateway URL
output "api_url" {
  value = "${aws_apigatewayv2_stage.default.invoke_url}/process"
}

# Output AWS region for CLI commands
output "aws_region" {
  value = var.aws_region
}
