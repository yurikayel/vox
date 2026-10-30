FROM python:3.12-alpine

WORKDIR /app

# Servidores stdlib puros do Vox (zero dependencias pip)
COPY relay/signaling.py relay/server.py relay/inbox.py relay/mirror_validate.py ./

# Porta padrao dinamica ($PORT injetada por Render, Zeabur, SnapDeploy, Koyeb, Railway)
ENV PORT=10000
EXPOSE 10000 8080 3921 3920 80 443

CMD ["python", "-u", "signaling.py", "--host", "0.0.0.0"]
