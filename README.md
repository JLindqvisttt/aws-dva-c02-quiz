# AWS Cert Study Portal

Offline-capable, multi-certification AWS quiz portal.

## Certification Coverage
Implemented question banks:
- DVA-C02 (Developer - Associate)
- SAA-C03 (Solutions Architect - Associate)
- SCS-C02 (Security - Specialty)

Catalog included in portal:
- Foundational: CLF-C02, AIF-C01
- Associate: SOA-C02, DVA-C02, SAA-C03, DEA-C01, MLA-C01
- Professional: SAP-C02, DOP-C02
- Specialty: ANS-C01, MLS-C01, SCS-C02

## Features
- Portal page listing all certifications
- Separate per-cert quiz apps with isolated question banks
- Quick quiz, exam simulation, study cards, flashcards
- Per-cert progress in localStorage key aws-quiz-progress-<cert-id>
- Feedback and feature request page
- AWS Slack feedback backend template (API Gateway + Lambda)

## Project Structure
- index.html: certification portal
- style.css: shared styling
- app.js: shared quiz engine
- dva-c02.html / saa-c03.html / scs-c02.html: implemented cert pages
- questions-dva-c02.js / questions-saa-c03.js / questions-scs-c02.js: question banks
- coming-soon.html: placeholder page for planned certs
- feedback.html: frontend form for feedback and bug reports
- aws/feedback-lambda/: AWS SAM backend to send feedback to Slack

## Run Locally
1. python3 -m http.server 8000
2. Open http://127.0.0.1:8000/

## Feedback to Slack Setup
1. Deploy aws/feedback-lambda with SAM (see aws/feedback-lambda/README.md).
2. Copy FeedbackApiUrl output.
3. Set window.FEEDBACK_API_URL inside feedback.html.

## Repository Name
Recommended name: aws-cert-study-portal
