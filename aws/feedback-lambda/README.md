# Feedback to Slack (AWS)

This folder contains a minimal AWS SAM deployment:
- API Gateway HTTP API endpoint: POST /feedback
- Lambda function: validates payload and forwards to Slack webhook

## Prerequisites
- AWS CLI configured
- AWS SAM CLI installed
- Slack incoming webhook URL

## Deploy
1. sam build
2. sam deploy --guided

Set parameter values:
- SlackWebhookUrl: your Slack webhook URL
- FeedbackToken: optional shared token

Copy output FeedbackApiUrl and set it in feedback.html:
window.FEEDBACK_API_URL = 'https://<api-id>.execute-api.<region>.amazonaws.com/feedback'

If FeedbackToken is set, add x-feedback-token header in frontend fetch.
