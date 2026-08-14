import { FormEvent, useEffect, useRef, useState } from "react";
import {
  Badge,
  Body1,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
  Subtitle1,
  Text,
  Title1,
  Title2,
} from "@fluentui/react-components";
import {
  Building24Regular,
  CalendarLtr24Regular,
  CheckmarkCircle24Filled,
  Food24Regular,
  Search24Regular,
} from "@fluentui/react-icons";
import { getMeals, MealResponse, School, searchSchools } from "./api";

type RequestState = "idle" | "loading" | "success" | "empty" | "error";

function localDateValue(offsetDays = 0): string {
  const value = new Date();
  value.setDate(value.getDate() + offsetDays);
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "full",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

export default function App() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<School[]>([]);
  const [suggestionState, setSuggestionState] =
    useState<RequestState>("idle");
  const [suggestionError, setSuggestionError] = useState("");
  const [schools, setSchools] = useState<School[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null);
  const [schoolState, setSchoolState] = useState<RequestState>("idle");
  const [schoolError, setSchoolError] = useState("");
  const [dateFrom, setDateFrom] = useState(localDateValue());
  const [dateTo, setDateTo] = useState(localDateValue(7));
  const [dateError, setDateError] = useState("");
  const [mealState, setMealState] = useState<RequestState>("idle");
  const [mealResult, setMealResult] = useState<MealResponse | null>(null);
  const [mealError, setMealError] = useState("");
  const schoolRequest = useRef<AbortController | null>(null);
  const suggestionRequest = useRef<AbortController | null>(null);
  const mealRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    const normalized = query.trim();
    suggestionRequest.current?.abort();

    if (normalized.length < 2 || selectedSchool?.name === normalized) {
      setSuggestions([]);
      setSuggestionState("idle");
      setSuggestionError("");
      return;
    }

    const timer = window.setTimeout(async () => {
      const controller = new AbortController();
      suggestionRequest.current = controller;
      setSuggestionState("loading");
      setSuggestionError("");

      try {
        const result = await searchSchools(normalized, controller.signal);
        setSuggestions(result.slice(0, 6));
        setSuggestionState(result.length > 0 ? "success" : "empty");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setSuggestions([]);
        setSuggestionState("error");
        setSuggestionError(
          error instanceof Error
            ? error.message
            : "추천 학교를 불러오지 못했습니다.",
        );
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
      suggestionRequest.current?.abort();
    };
  }, [query, selectedSchool]);

  useEffect(
    () => () => {
      schoolRequest.current?.abort();
      suggestionRequest.current?.abort();
      mealRequest.current?.abort();
    },
    [],
  );

  const clearMeals = () => {
    mealRequest.current?.abort();
    setMealState("idle");
    setMealResult(null);
    setMealError("");
  };

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setSuggestions([]);
    setSuggestionState("idle");
    setSuggestionError("");
    setSelectedSchool(null);
    setSchools([]);
    setSchoolState("idle");
    setSchoolError("");
    clearMeals();
  };

  const handleSchoolSearch = async (event: FormEvent) => {
    event.preventDefault();
    const normalized = query.trim();
    if (!normalized) {
      setSchoolState("error");
      setSchoolError("검색할 학교명을 입력해 주세요.");
      return;
    }

    schoolRequest.current?.abort();
    suggestionRequest.current?.abort();
    const controller = new AbortController();
    schoolRequest.current = controller;
    setSelectedSchool(null);
    setSchools([]);
    setSchoolState("loading");
    setSchoolError("");
    setSuggestions([]);
    setSuggestionState("idle");
    clearMeals();

    try {
      const result = await searchSchools(normalized, controller.signal);
      setSchools(result);
      setSchoolState(result.length > 0 ? "success" : "empty");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setSchoolState("error");
      setSchoolError(
        error instanceof Error
          ? error.message
          : "학교 검색에 실패했습니다. 다시 시도해 주세요.",
      );
    }
  };

  const selectSchool = (school: School) => {
    suggestionRequest.current?.abort();
    setQuery(school.name);
    setSuggestions([]);
    setSuggestionState("idle");
    setSuggestionError("");
    setSelectedSchool(school);
    setSchools((current) =>
      current.some(
        (item) =>
          item.educationOfficeCode === school.educationOfficeCode &&
          item.schoolCode === school.schoolCode,
      )
        ? current
        : [school],
    );
    setSchoolState("success");
    clearMeals();
  };

  const changeDate = (kind: "from" | "to", value: string) => {
    if (kind === "from") setDateFrom(value);
    else setDateTo(value);
    setDateError("");
    clearMeals();
  };

  const handleMealSearch = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedSchool) {
      setDateError("먼저 학교를 선택해 주세요.");
      return;
    }
    if (!dateFrom || !dateTo) {
      setDateError("시작일과 종료일을 모두 입력해 주세요.");
      return;
    }
    if (dateFrom > dateTo) {
      setDateError("시작일은 종료일보다 늦을 수 없습니다.");
      return;
    }

    mealRequest.current?.abort();
    const controller = new AbortController();
    mealRequest.current = controller;
    setDateError("");
    setMealResult(null);
    setMealState("loading");
    setMealError("");

    try {
      const result = await getMeals(
        selectedSchool,
        dateFrom,
        dateTo,
        controller.signal,
      );
      setMealResult(result);
      setMealState(result.meals.length > 0 ? "success" : "empty");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMealState("error");
      setMealError(
        error instanceof Error
          ? error.message
          : "급식 조회에 실패했습니다. 다시 시도해 주세요.",
      );
    }
  };

  return (
    <div className="app-shell">
      <header className="hero">
        <Badge appearance="tint" color="brand" size="large">
          NEIS 학교 급식
        </Badge>
        <Title1 as="h1">오늘, 우리 학교는 뭐 먹지?</Title1>
        <Body1>
          학교를 찾고 날짜를 고르면 중식 메뉴를 한눈에 확인할 수 있어요.
        </Body1>
      </header>

      <main className="workflow">
        <section className="step-section" aria-labelledby="school-step-title">
          <div className="step-heading">
            <span className="step-number">1</span>
            <div>
              <Title2 id="school-step-title">학교 찾기</Title2>
              <Text>학교 이름의 일부만 입력해도 검색할 수 있어요.</Text>
            </div>
          </div>

          <form className="search-form" onSubmit={handleSchoolSearch}>
            <div className="suggestion-field">
              <Field
                label="학교명"
                validationState={schoolState === "error" && !query.trim() ? "error" : "none"}
              >
                <Input
                  value={query}
                  onChange={(_, data) => handleQueryChange(data.value)}
                  placeholder="예: 서울고등학교"
                  contentBefore={<Search24Regular />}
                  disabled={schoolState === "loading"}
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={
                    suggestionState !== "idle" && query.trim().length >= 2
                  }
                  aria-controls="school-suggestions"
                />
              </Field>
              {query.trim().length >= 2 && suggestionState !== "idle" && (
                <div
                  id="school-suggestions"
                  className="suggestion-panel"
                  role="listbox"
                  aria-label="추천 학교"
                >
                  {suggestionState === "loading" && (
                    <Spinner size="tiny" label="추천 학교를 찾고 있습니다." />
                  )}
                  {suggestionState === "empty" && (
                    <Text>추천 학교가 없습니다. 검색 버튼을 눌러 확인해 보세요.</Text>
                  )}
                  {suggestionState === "error" && (
                    <Text className="suggestion-error">{suggestionError}</Text>
                  )}
                  {suggestionState === "success" &&
                    suggestions.map((school) => (
                      <button
                        type="button"
                        role="option"
                        aria-selected={false}
                        className="suggestion-option"
                        key={`${school.educationOfficeCode}-${school.schoolCode}`}
                        onClick={() => selectSchool(school)}
                      >
                        <span>
                          <strong>{school.name}</strong>
                          <Text size={200}>
                            {[school.schoolType, school.educationOfficeName]
                              .filter(Boolean)
                              .join(" · ")}
                          </Text>
                        </span>
                        {school.location && (
                          <Text size={200}>{school.location}</Text>
                        )}
                      </button>
                    ))}
                </div>
              )}
            </div>
            <Button
              appearance="primary"
              type="submit"
              icon={<Search24Regular />}
              disabled={schoolState === "loading"}
            >
              학교 검색
            </Button>
          </form>

          <div aria-live="polite">
            {schoolState === "loading" && (
              <Spinner label="학교를 찾고 있습니다." />
            )}
            {schoolState === "error" && (
              <MessageBar intent="error">
                <MessageBarBody>
                  <MessageBarTitle>학교를 찾지 못했습니다</MessageBarTitle>
                  {schoolError}
                </MessageBarBody>
                {query.trim() && (
                  <Button appearance="transparent" onClick={handleSchoolSearch}>
                    다시 시도
                  </Button>
                )}
              </MessageBar>
            )}
            {schoolState === "empty" && (
              <MessageBar>
                <MessageBarBody>
                  <MessageBarTitle>검색 결과가 없습니다</MessageBarTitle>
                  학교 이름을 확인하거나 더 짧은 검색어로 다시 찾아보세요.
                </MessageBarBody>
              </MessageBar>
            )}
          </div>

          {schools.length > 0 && (
            <div className="school-grid" role="radiogroup" aria-label="검색된 학교">
              {schools.map((school) => {
                const selected =
                  selectedSchool?.educationOfficeCode === school.educationOfficeCode &&
                  selectedSchool.schoolCode === school.schoolCode;
                return (
                  <Card
                    key={`${school.educationOfficeCode}-${school.schoolCode}`}
                    className={selected ? "school-card selected" : "school-card"}
                  >
                    <button
                      type="button"
                      className="school-choice"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => selectSchool(school)}
                    >
                      <Building24Regular />
                      <span>
                        <Subtitle1>{school.name}</Subtitle1>
                        <Text block>
                          {[school.schoolType, school.educationOfficeName]
                            .filter(Boolean)
                            .join(" · ")}
                        </Text>
                        {school.location && (
                          <Text block size={200}>
                            {school.location}
                          </Text>
                        )}
                      </span>
                      {selected && (
                        <CheckmarkCircle24Filled
                          className="selected-icon"
                          aria-label="선택됨"
                        />
                      )}
                    </button>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        <section
          className={selectedSchool ? "step-section" : "step-section disabled-step"}
          aria-labelledby="date-step-title"
        >
          <div className="step-heading">
            <span className="step-number">2</span>
            <div>
              <Title2 id="date-step-title">날짜 선택</Title2>
              <Text>
                {selectedSchool
                  ? `${selectedSchool.name}의 중식 조회 기간을 선택하세요.`
                  : "학교를 선택하면 날짜를 고를 수 있어요."}
              </Text>
            </div>
          </div>

          <form className="date-form" onSubmit={handleMealSearch}>
            <Field label="시작일" validationState={dateError ? "error" : "none"}>
              <Input
                type="date"
                value={dateFrom}
                onChange={(_, data) => changeDate("from", data.value)}
                contentBefore={<CalendarLtr24Regular />}
                disabled={!selectedSchool || mealState === "loading"}
              />
            </Field>
            <Field
              label="종료일"
              validationState={dateError ? "error" : "none"}
              validationMessage={dateError}
            >
              <Input
                type="date"
                value={dateTo}
                onChange={(_, data) => changeDate("to", data.value)}
                contentBefore={<CalendarLtr24Regular />}
                disabled={!selectedSchool || mealState === "loading"}
              />
            </Field>
            <Button
              appearance="primary"
              type="submit"
              icon={<Food24Regular />}
              disabled={!selectedSchool || mealState === "loading"}
            >
              중식 조회
            </Button>
          </form>
        </section>

        <section className="step-section results" aria-labelledby="result-step-title">
          <div className="step-heading">
            <span className="step-number">3</span>
            <div>
              <Title2 id="result-step-title">급식 확인</Title2>
              <Text>날짜별 메뉴와 상세 정보를 확인하세요.</Text>
            </div>
          </div>

          <div aria-live="polite">
            {mealState === "idle" && (
              <div className="empty-panel">
                <Food24Regular />
                <Subtitle1>학교와 날짜를 선택하고 중식을 조회해 주세요.</Subtitle1>
              </div>
            )}
            {mealState === "loading" && (
              <Spinner size="large" label="중식 메뉴를 불러오고 있습니다." />
            )}
            {mealState === "error" && (
              <MessageBar intent="error">
                <MessageBarBody>
                  <MessageBarTitle>급식을 불러오지 못했습니다</MessageBarTitle>
                  {mealError}
                </MessageBarBody>
                <Button appearance="transparent" onClick={handleMealSearch}>
                  다시 시도
                </Button>
              </MessageBar>
            )}
            {mealState === "empty" && (
              <MessageBar intent="info">
                <MessageBarBody>
                  <MessageBarTitle>중식 정보가 없습니다</MessageBarTitle>
                  선택한 기간에는 등록된 중식이 없습니다. 다른 날짜를 선택해 보세요.
                </MessageBarBody>
              </MessageBar>
            )}
          </div>

          {mealState === "success" && mealResult && (
            <div className="meal-grid">
              {mealResult.meals.map((meal) => (
                <Card key={`${meal.date}-${meal.mealType}`} className="meal-card">
                  <CardHeader
                    image={<span className="meal-icon"><Food24Regular /></span>}
                    header={<Subtitle1>{formatDate(meal.date)}</Subtitle1>}
                    description={
                      <Badge appearance="tint" color="brand">
                        {meal.mealType}
                      </Badge>
                    }
                  />
                  <ul className="menu-list">
                    {meal.menu.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <div className="meal-meta">
                    {meal.calories && <Text>열량 {meal.calories}</Text>}
                    {meal.headcount !== null && (
                      <Text>급식 인원 {meal.headcount.toLocaleString()}명</Text>
                    )}
                  </div>
                  {(meal.nutrition || meal.origin) && (
                    <details>
                      <summary>영양·원산지 정보</summary>
                      {meal.nutrition && <Text block>{meal.nutrition}</Text>}
                      {meal.origin && <Text block>{meal.origin}</Text>}
                    </details>
                  )}
                </Card>
              ))}
            </div>
          )}
        </section>
      </main>

      <footer>
        <Text>급식 정보는 NEIS 교육정보 개방 포털에서 제공합니다.</Text>
      </footer>
    </div>
  );
}
