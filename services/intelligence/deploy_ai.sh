#!/bin/bash
set -e

PROJECT_ID=$(gcloud config get-value project)
REGION="asia-south1"
REPO_NAME="civicweave-repo"
IMAGE_NAME="asia-south1-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/civicweave-ai:latest"

echo "1. Creating Artifact Registry repository in $REGION..."
gcloud artifacts repositories create $REPO_NAME \
  --repository-format=docker \
  --location=$REGION \
  --description="CivicWeave AI Docker repository" || echo "Repository may already exist."

echo "2. Building and pushing the Docker image..."
# Use docker buildx for linux/amd64 as requested for Cloud Run compatibility
docker buildx build --platform linux/amd64 -t $IMAGE_NAME --push .

echo "3. Creating Secret Manager secrets..."
# Helper function to create a secret if it doesn't exist
create_secret() {
  local SECRET_NAME=$1
  gcloud secrets create $SECRET_NAME --replication-policy="automatic" || echo "Secret $SECRET_NAME exists"
}

create_secret "GEMINI_API_KEY"
create_secret "GROQ_API_KEY"
create_secret "INTERNAL_SERVICE_SECRET"
create_secret "KNOWLEDGE_DATABASE_URL"

echo "Please ensure the secrets have values populated in Secret Manager!"
echo "e.g., echo -n 'your-key' | gcloud secrets versions add GEMINI_API_KEY --data-file=-"

echo "4. Deploying to Cloud Run..."
gcloud run deploy civicweave-ai \
  --image $IMAGE_NAME \
  --region $REGION \
  --set-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest,GROQ_API_KEY=GROQ_API_KEY:latest,INTERNAL_SERVICE_SECRET=INTERNAL_SERVICE_SECRET:latest,KNOWLEDGE_DATABASE_URL=KNOWLEDGE_DATABASE_URL:latest" \
  --set-env-vars="GEMINI_FAST_MODEL=gemini-2.5-flash,GROQ_FAST_MODEL=llama-3.3-70b-versatile,GEMINI_EMBED_MODEL=gemini-embedding-2,EMBED_DIM=768,CW_MODEL_PROFILE=production,CRAWLER_USER_AGENT=CivicWeaveBot/1.0" \
  --min-instances 0 \
  --max-instances 3 \
  --memory 1Gi \
  --cpu 1 \
  --timeout 60 \
  --allow-unauthenticated
