#!/bin/bash

# =============================================================================
# Auto Startup Script for Development Server
# =============================================================================
# This script automatically runs 'npm run dev' in the project directory
# =============================================================================

# Configuration: Set your project path here
# For Windows (Git Bash/WSL): Use forward slashes or escaped backslashes
# Example: PROJECT_PATH="/c/Users/aksha/Downloads/GoyalsonsManagementSystem (1)/GoyalsonsManagementSystem"
# Example: PROJECT_PATH="/mnt/c/Users/aksha/Downloads/GoyalsonsManagementSystem (1)/GoyalsonsManagementSystem" (WSL)
PROJECT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors for output (optional, for better readability)
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print colored messages
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if project directory exists
if [ ! -d "$PROJECT_PATH" ]; then
    print_error "Project directory not found: $PROJECT_PATH"
    exit 1
fi

print_info "Starting development server..."
print_info "Project path: $PROJECT_PATH"

# Navigate to project directory
cd "$PROJECT_PATH" || {
    print_error "Failed to navigate to project directory"
    exit 1
}

# Check if package.json exists (to verify it's a Node.js project)
if [ ! -f "package.json" ]; then
    print_error "package.json not found. Are you sure this is a Node.js project?"
    exit 1
fi

# Check if node_modules exists (optional check)
if [ ! -d "node_modules" ]; then
    print_warning "node_modules not found. Run 'npm install' first?"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Run npm run dev
print_info "Starting development server with 'npm run dev'..."
npm run dev

# Note: The script will continue running as long as npm run dev is running
# When you stop npm run dev (Ctrl+C), this script will exit

