variable "aws_region" {
  description = "AWS region to deploy resources"
  type        = string
  default     = "us-east-1"
}

variable "s3_bucket_name" {
  description = "Name of the S3 bucket to store AVIF images"
  type        = string
  default     = "ygo-card-images-avif"
}

variable "sharp_layer_arn" {
  description = "ARN of the Sharp layer to use with Lambda"
  type        = string
  # Using a public Sharp layer ARN from Klarna's public layers
  default     = "arn:aws:lambda:us-east-1:558622615045:layer:sharp:1"
}
