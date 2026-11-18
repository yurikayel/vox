FROM python:3.15-alpine

WORKDIR /app

# Layout de pacote: server.py faz `from relay import ...`, então os módulos
# ficam em /app/relay/ (namespace package) e /app entra no PYTHONPATH.
# O contexto de build é a pasta relay/ (Render, HF, compose). Os test_*.py ficam
# de fora via relay/.dockerignore. Zero dependências pip.
COPY *.py ./relay/
ENV PYTHONPATH=/app

# Porta padrão para instâncias gratuitas em nuvem (7860 para HF Spaces; Koyeb e Render injetam $PORT)
ENV PORT=7860
EXPOSE 7860 3921 3920

# Padrão: só a sinalização WebRTC (nó público). O relay completo roda com
# `python -u -m relay.server --host 0.0.0.0 --port 3920` (ver relay/deploy/docker-compose.yml).
CMD ["python", "-u", "relay/signaling.py", "--host", "0.0.0.0"]
