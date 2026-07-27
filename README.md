# 급식배틀: 초중고 급식 메뉴 조회 및 분석 앱

NEIS 공개 API를 활용한 초중고 급식 메뉴 조회 및 분석 웹 애플리케이션입니다.

<!--
## 주요 기능

- 학교 이름의 일부로 학교를 검색합니다.
- 학교와 조회할 날짜 범위를 선택합니다.
- 날짜별 중식 메뉴와 조회 결과 없음 또는 API 오류 상태를 표시합니다.
- 브라우저에서 NEIS API를 직접 호출하지 않고 Python API를 통해 연동합니다.
- React 프론트엔드와 Python 백엔드를 Docker Compose로 함께 실행합니다.

## 아키텍처

| 구성 요소 | 기술 | 역할 |
| --- | --- | --- |
| 프론트엔드 | React 및 TypeScript | 학교 검색, 날짜 선택 및 급식 메뉴 표시 |
| 백엔드 | Python | NEIS API 연동, 입력값 검증 및 응답 데이터 구성 |
| 실행 환경 | Docker Compose | 프론트엔드와 백엔드의 로컬 오케스트레이션 |

예정된 소스 디렉터리 구조는 다음과 같습니다.

```text
frontend/    React 및 TypeScript 애플리케이션
backend/     Python API 애플리케이션
src/         openapi.json을 포함한 공용 명세
data/        원본 API 문서
```

## 개발 환경 요구사항

- Git
- Node.js 22 이상
- Python 3.12 이상
- Docker Compose를 포함한 Docker Desktop

## 설치

```sh
git clone https://github.com/justinyoo/battle-school-lunch.git
cd battle-school-lunch
```

프론트엔드와 백엔드의 매니페스트 파일이 생성된 후 로컬 개발 의존성을
설치합니다.

```sh
cd frontend
npm install

cd ../backend
python -m venv .venv
# 사용 중인 셸에서 .venv를 활성화한 후 실행합니다.
python -m pip install -e ".[dev]"
```

## 애플리케이션 실행

전체 애플리케이션을 빌드하고 실행합니다.

```sh
docker compose up --build
```

프론트엔드와 백엔드의 URL은 애플리케이션 구현 시 `compose.yml`에
정의합니다.

## 개발

프론트엔드 검사를 실행합니다.

```sh
cd frontend
npm run build
npm test
```

백엔드 검사를 실행합니다.

```sh
cd backend
pytest
```

프로젝트 구현 작업은 `.github/bootstrap-issues/`의 초기 설정 이슈에서
관리합니다.

-->

## 기여하기

개발 환경 설정 및 Pull Request 안내는
[CONTRIBUTING.md](CONTRIBUTING.md)를 참고하세요.

## 보안

취약점을 비공개로 신고하려면 [SECURITY.md](SECURITY.md)를 참고하세요.

## 라이선스

이 프로젝트는 [MIT 라이선스](LICENSE)를 따릅니다.
