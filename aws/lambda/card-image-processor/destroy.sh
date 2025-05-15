#!/bin/zsh

set -e

echo "🧹 Starting AVIF Converter Lambda Destruction"

# Directory check
if [[ ! -f ./main.tf || ! -f ./terraform.tfstate ]]; then
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

echo "⚠️ This will DESTROY all AWS resources created by Terraform"
echo "⚠️ Including Lambda, S3 bucket, API Gateway, and IAM roles"

if confirm "Are you sure you want to destroy these resources?"; then
  # Run terraform destroy
  echo "🏗️ Running terraform destroy..."
  terraform destroy
  
  echo "✅ Resources successfully destroyed"
else
  echo "❌ Destruction cancelled"
  exit 1
fi
