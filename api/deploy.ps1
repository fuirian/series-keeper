# 백엔드를 Google Cloud Run 서울(asia-northeast3)에 배포한다.
#
# 처음 한 번 (사용자가 직접):
#   1. https://console.cloud.google.com 에서 프로젝트 만들기 + 결제 계정 연결
#   2. gcloud CLI 설치 후:  gcloud auth login
#   3. 이 스크립트를 -ProjectId 와 함께 실행
#
# 비밀 값(DATABASE_URL)은 이미지·코드에 넣지 않고 Secret Manager에 둔다.
# api/.env의 값을 읽어 Secret Manager에 올린다 (화면에는 출력하지 않음).
#
# 사용:  .\deploy.ps1 -ProjectId my-project-id
#       .\deploy.ps1 -ProjectId my-project-id -SkipSetup   # 두 번째부터 (코드만 다시 배포)

param(
  [Parameter(Mandatory = $true)][string]$ProjectId,
  [string]$Region = "asia-northeast3",
  [string]$Service = "skapi",
  [string]$WebOrigins = "https://series-keeper-mu.vercel.app,http://localhost:3000",
  [switch]$SkipSetup
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Read-DotEnv([string]$name) {
  $line = Get-Content .env | Where-Object { $_ -match "^$name=" } | Select-Object -First 1
  if (-not $line) { throw "api/.env에 $name 이 없습니다." }
  return $line.Substring($name.Length + 1).Trim().Trim('"')
}

$supabaseUrl = Read-DotEnv "SUPABASE_URL"

gcloud config set project $ProjectId | Out-Null

if (-not $SkipSetup) {
  Write-Host "1/3 필요한 Google Cloud 기능 켜기 (처음엔 1~2분)"
  gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com

  Write-Host "2/3 DATABASE_URL을 Secret Manager에 저장"
  $tmp = New-TemporaryFile
  try {
    [IO.File]::WriteAllText($tmp, (Read-DotEnv "DATABASE_URL"), [Text.UTF8Encoding]::new($false))
    gcloud secrets describe skapi-database-url 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
      gcloud secrets versions add skapi-database-url --data-file=$tmp | Out-Null
    } else {
      gcloud secrets create skapi-database-url --replication-policy=automatic --data-file=$tmp | Out-Null
    }
  } finally {
    Remove-Item $tmp -Force
  }

  # Cloud Run 실행 계정이 이 비밀 값만 읽을 수 있게
  $projectNumber = gcloud projects describe $ProjectId --format="value(projectNumber)"
  gcloud secrets add-iam-policy-binding skapi-database-url `
    --member="serviceAccount:$projectNumber-compute@developer.gserviceaccount.com" `
    --role="roles/secretmanager.secretAccessor" | Out-Null
}

Write-Host "3/3 빌드하고 배포 (Dockerfile 기준, 3~5분)"
# 쉼표가 들어간 값이 있어서 환경 변수 구분자를 ^@^ 로 바꾼다
gcloud run deploy $Service `
  --source . `
  --region $Region `
  --allow-unauthenticated `
  --min-instances 0 `
  --max-instances 3 `
  --memory 512Mi `
  --set-env-vars "^@^SUPABASE_URL=$supabaseUrl@CORS_ORIGINS=$WebOrigins" `
  --set-secrets "DATABASE_URL=skapi-database-url:latest"

$url = gcloud run services describe $Service --region $Region --format="value(status.url)"
Write-Host ""
Write-Host "배포 주소: $url"
Write-Host "확인:      $url/v1/health"
Write-Host "Vercel 환경 변수 API_URL 에 위 배포 주소를 넣고 웹을 다시 배포하세요."
