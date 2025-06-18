#!/bin/bash

# Obter o diretório onde o script está localizado
BASE_DIR=$(dirname "$(realpath "$0")")  # Caminho absoluto do diretório do script

# Subir duas pastas para chegar na raiz do projeto (backend)
ROOT_DIR=$(dirname "$(dirname "$BASE_DIR")")  # Subindo duas pastas

# Agora, o caminho para o diretório Backend
PROJETO_PATH="${ROOT_DIR}"  # Caminho para o diretório Backend

# Verificar se o diretório Backend existe
if [ ! -d "$PROJETO_PATH" ]; then
  echo "Erro: o diretório Backend não foi encontrado em ${PROJETO_PATH}."
  exit 1
fi

# Definir caminhos para a pasta public dentro do Backend e o destino
PUBLIC_PATH="${PROJETO_PATH}/public"
DESTINO_PATH="$(dirname "$PROJETO_PATH")/public"  # Caminho fora do Backend para o destino

# Obter data e hora atual para renomear o arquivo
DATA_HORA=$(date +"%Y-%m-%d_%H-%M-%S")

# Verificar o sistema operacional
OS=$(uname)

# Compactar a pasta public (adaptado para Windows e Linux)
if [[ "$OS" == "Linux" ]]; then
    echo "Compactando a pasta ${PUBLIC_PATH} no Linux..."
    zip -r "${PROJETO_PATH}/public-${DATA_HORA}.zip" "$PUBLIC_PATH"
elif [[ "$OS" == "Darwin" ]]; then
    # Caso seja macOS, o comando zip também é válido
    echo "Compactando a pasta ${PUBLIC_PATH} no macOS..."
    zip -r "${PROJETO_PATH}/public-${DATA_HORA}.zip" "$PUBLIC_PATH"
elif [[ "$OS" == "MINGW"* || "$OS" == "CYGWIN"* || "$OS" == "MSYS"* ]]; then
    # Caso seja Windows
    echo "Compactando a pasta ${PUBLIC_PATH} no Windows..."
    # No Windows, o caminho precisa estar formatado corretamente
    powershell -Command "Compress-Archive -Path '${PUBLIC_PATH}' -DestinationPath '${PROJETO_PATH}/public-${DATA_HORA}.zip'"
else
    echo "Sistema operacional desconhecido. Não é possível compactar."
    exit 1
fi

# Verificar se o diretório de destino existe, caso não, criar
echo "Verificando se o diretório de destino ${DESTINO_PATH} existe..."
if [ ! -d "$DESTINO_PATH" ]; then
  echo "Diretório de destino não encontrado. Criando..."
  mkdir -p "$DESTINO_PATH"
fi

# Mover o arquivo compactado para o destino fora do projeto
echo "Movendo o arquivo compactado para ${DESTINO_PATH}..."
mv "${PROJETO_PATH}/public-${DATA_HORA}.zip" "$DESTINO_PATH"

# Remover a pasta public original do projeto
echo "Removendo a pasta ${PUBLIC_PATH} do projeto..."
rm -rf "$PUBLIC_PATH"

# Recriar a pasta public no projeto
echo "Recriando a pasta public no projeto..."
mkdir "$PUBLIC_PATH"

echo "Processo concluído com sucesso!"

