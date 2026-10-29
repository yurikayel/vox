FROM python:3.12-alpine

WORKDIR /app

# Servidores stdlib puros do Vox (zero dependências pip)
COPY signaling.py server.py inbox.py mirror_validate.py ./

# Porta padrão para instâncias gratuitas em nuvem (7860 para HF Spaces; Koyeb e Render injetam $PORT)
ENV PORT=7860
EXPOSE 7860 3921 3920

CMD ["python", "-u", "signaling.py", "--host", "0.0.0.0"]
