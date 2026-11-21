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

EXPOSE 8000
CMD ["uvicorn", "skapi.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]
