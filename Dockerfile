FROM python:3.13-slim

WORKDIR /app

RUN apt-get update && \
    apt-get install -y wget && \
    rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

WORKDIR /app/backend

RUN chmod +x start.sh

EXPOSE 7860

CMD ["./start.sh"]