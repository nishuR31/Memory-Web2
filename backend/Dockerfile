FROM python:3.13-slim

WORKDIR /app

RUN apt-get update && apt-get install -y wget

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

WORKDIR /app/backend

RUN mkdir -p data

RUN wget "https://huggingface.co/datasets/dream691/endAML-assets/resolve/main/vector_index.faiss" \
    -O data/vector_index.faiss

EXPOSE 7860

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]