FROM python:3.12-alpine

WORKDIR /app

# Copia apenas os servidores stdlib (zero dependências pip)
COPY signaling.py server.py ./

EXPOSE 3920 3921

CMD ["python", "-u", "signaling.py", "--host", "0.0.0.0", "--port", "3921"]
