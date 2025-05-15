# Makefile for AWS Lambda AVIF conversion function

.PHONY: build package deploy destroy clean help

# Default target
all: build package

# Build the Lambda function
build:
	@echo "Building Lambda function..."
	npm run build

# Create deployment package
package: build
	@echo "Creating deployment package..."
	npm run package

# Deploy using the deployment script
deploy: package
	@echo "Deploying Lambda function..."
	./deploy.sh

# Destroy deployed resources
destroy:
	@echo "Destroying deployed resources..."
	./destroy.sh

# Clean build artifacts
clean:
	@echo "Cleaning build artifacts..."
	rm -rf dist
	rm -f convert-to-avif.zip
	rm -f test-payload.json
	rm -f test-image-result.avif

# Display help
help:
	@echo "Available commands:"
	@echo "  make build    - Build the Lambda function"
	@echo "  make package  - Create deployment package (ZIP file)"
	@echo "  make deploy   - Deploy using the deployment script"
	@echo "  make destroy  - Destroy deployed resources"
	@echo "  make clean    - Clean build artifacts"
	@echo "  make all      - Build and package (default)"
	@echo "  make help     - Display this help message"
