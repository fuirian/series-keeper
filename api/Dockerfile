# 배포용 이미지 (6단계에서 서울 리전에 올린다). 비밀 값은 이미지에 넣지 않고 환경 변수로 준다.
FROM python:3.12-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

COPY pyproject.toml ./
COPY src ./src
RUN pip install --no-cache-dir .

# root가 아닌 사용자로 실행
RUN useradd --create-home app
USER app

# Cloud Run은 PORT 환경 변수(기본 8080)로 포트를 알려 준다. 없으면 8000
EXPOSE 8000
CMD ["sh", "-c", "exec uvicorn skapi.main:create_app --factory --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers"]
