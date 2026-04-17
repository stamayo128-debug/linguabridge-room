# Vertex AI Gemini 1.5 Python SDK Guide

This guide provides a comprehensive overview of how to integrate Google Vertex AI's Gemini 1.5 models into your Python microservices.

## Prerequisites

1.  **Google Cloud Project**: Ensure you have a GCP project with the Vertex AI API enabled.
2.  **Authentication**: 
    - Install the Google Cloud CLI: `gcloud auth application-default login`
    - Or use a Service Account JSON key: `export GOOGLE_APPLICATION_CREDENTIALS="path/to/key.json"`
3.  **Installation**:
    ```bash
    pip install google-cloud-aiplatform
    ```

## Initialization

```python
import vertexai
from vertexai.generative_models import GenerativeModel, Part, FinishReason
import vertexai.preview.generative_models as generative_models

PROJECT_ID = "your-project-id"
LOCATION = "us-central1"

vertexai.init(project=PROJECT_ID, location=LOCATION)
```

## Text Generation (Gemini 1.5 Flash)

Gemini 1.5 Flash is optimized for speed and efficiency, making it ideal for translation and high-throughput tasks.

```python
def generate_text(prompt):
    model = GenerativeModel("gemini-1.5-flash-001")
    responses = model.generate_content(
        prompt,
        generation_config={
            "max_output_tokens": 2048,
            "temperature": 0.2,
            "top_p": 1,
        },
        stream=False,
    )
    return responses.text

# Example: Translation
prompt = "Translate the following text to Spanish: 'Hello, how are you today?'"
print(generate_text(prompt))
```

## Chat Sessions (Gemini 1.5 Pro)

Gemini 1.5 Pro is better for complex reasoning and long-context conversations.

```python
model = GenerativeModel("gemini-1.5-pro-001")
chat = model.start_chat()

def send_chat_message(message):
    response = chat.send_message(message)
    return response.text

print(send_chat_message("Hello! I am building a translation app."))
print(send_chat_message("What are the best practices for real-time translation?"))
```

## Multimodal Input (Audio/Video/Images)

Gemini 1.5 models supports native multi-modal input.

```python
def process_multimodal(prompt, file_path, mime_type):
    model = GenerativeModel("gemini-1.5-flash-001")
    file_part = Part.from_uri(uri=file_path, mime_type=mime_type)
    
    response = model.generate_content(
        [prompt, file_part],
        generation_config={"temperature": 0.0}
    )
    return response.text

# Example: Transcribe audio
# audio_uri = "gs://your-bucket/audio.mp3"
# print(process_multimodal("Transcribe this audio exactly.", audio_uri, "audio/mpeg"))
```

## Safety Settings

```python
safety_settings = {
    generative_models.HarmCategory.HARM_CATEGORY_HATE_SPEECH: generative_models.HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    generative_models.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: generative_models.HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    generative_models.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: generative_models.HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    generative_models.HarmCategory.HARM_CATEGORY_HARASSMENT: generative_models.HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
}

model = GenerativeModel("gemini-1.5-flash-001")
response = model.generate_content("Your prompt here", safety_settings=safety_settings)
```
