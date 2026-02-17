FROM --platform=linux/amd64 node:18
USER root
WORKDIR /app

RUN apt-get update && apt-get install -y python3 python3-pip git && \
    pip3 install --break-system-packages requests unidecode openai

COPY package.json tsconfig.json ./
RUN npm install

COPY src/ ./src/

EXPOSE 3000
CMD ["npx", "tsx", "src/index.ts"]
