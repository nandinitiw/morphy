FROM python:3.11-slim

# Stockfish is in Debian main; the package installs the binary to /usr/games.
# `test -x` fails the build loudly if that ever changes, instead of deferring
# the failure to the first analysis request at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends \
    stockfish \
    && rm -rf /var/lib/apt/lists/* \
    && test -x /usr/games/stockfish

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Add /usr/games to PATH so shutil.which() can find stockfish installed by apt
ENV PATH="/usr/games:${PATH}"
ENV STOCKFISH_PATH=/usr/games/stockfish

CMD uvicorn main:app --host 0.0.0.0 --port $PORT
