import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import App from "./App";

function renderApp() {
  return render(
    <FluentProvider theme={webLightTheme}>
      <App />
    </FluentProvider>,
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test("shows school suggestions after two characters and selects one", async () => {
  vi.useFakeTimers();
  const school = {
    educationOfficeCode: "B10",
    schoolCode: "701",
    name: "서울고등학교",
    educationOfficeName: "서울특별시교육청",
    location: "서울특별시",
    schoolType: "고등학교",
  };
  vi.spyOn(window, "fetch").mockResolvedValue(jsonResponse([school]));

  renderApp();
  fireEvent.input(screen.getByLabelText("학교명"), {
    target: { value: "서울" },
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });

  const option = screen.getByRole("option", {
    name: /서울고등학교/,
  });
  fireEvent.click(option);

  expect(screen.getByLabelText("학교명")).toHaveValue("서울고등학교");
  expect(screen.getByText("서울고등학교의 중식 조회 기간을 선택하세요."))
    .toBeInTheDocument();
  expect(screen.queryByRole("listbox", { name: "추천 학교" }))
    .not.toBeInTheDocument();
});

test("searches, selects a school, and renders lunch menus", async () => {
  const user = userEvent.setup();
  const fetchMock = vi
    .spyOn(window, "fetch")
    .mockResolvedValueOnce(
      jsonResponse([
        {
          educationOfficeCode: "B10",
          schoolCode: "701",
          name: "테스트고등학교",
          educationOfficeName: "서울특별시교육청",
          location: "서울특별시",
          schoolType: "고등학교",
        },
      ]),
    )
    .mockResolvedValueOnce(
      jsonResponse({
        school: {
          educationOfficeCode: "B10",
          schoolCode: "701",
          name: "테스트고등학교",
          educationOfficeName: "서울특별시교육청",
          location: null,
          schoolType: null,
        },
        meals: [
          {
            date: "2026-08-14",
            mealType: "중식",
            menu: ["현미밥", "된장국", "배추김치"],
            calories: "720 Kcal",
            nutrition: null,
            origin: null,
            headcount: 180,
          },
        ],
      }),
    );

  renderApp();
  await user.type(screen.getByLabelText("학교명"), "테스트고");
  await user.click(screen.getByRole("button", { name: "학교 검색" }));
  await user.click(
    await screen.findByRole("radio", { name: /테스트고등학교/ }),
  );
  await user.click(screen.getByRole("button", { name: "중식 조회" }));

  expect(await screen.findByText("현미밥")).toBeInTheDocument();
  expect(screen.getByText("급식 인원 180명")).toBeInTheDocument();
  expect(fetchMock).toHaveBeenNthCalledWith(
    1,
    "/api/schools?query=%ED%85%8C%EC%8A%A4%ED%8A%B8%EA%B3%A0",
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
});

test("blocks an invalid date range and clears meals after school input changes", async () => {
  const user = userEvent.setup();
  vi.spyOn(window, "fetch")
    .mockResolvedValueOnce(
      jsonResponse([
        {
          educationOfficeCode: "B10",
          schoolCode: "701",
          name: "테스트고등학교",
          educationOfficeName: "서울특별시교육청",
          location: null,
          schoolType: "고등학교",
        },
      ]),
    )
    .mockResolvedValueOnce(
      jsonResponse({
        school: {
          educationOfficeCode: "B10",
          schoolCode: "701",
          name: "테스트고등학교",
          educationOfficeName: null,
          location: null,
          schoolType: null,
        },
        meals: [
          {
            date: "2026-08-14",
            mealType: "중식",
            menu: ["현미밥"],
            calories: null,
            nutrition: null,
            origin: null,
            headcount: null,
          },
        ],
      }),
    );

  renderApp();
  await user.type(screen.getByLabelText("학교명"), "테스트");
  await user.click(screen.getByRole("button", { name: "학교 검색" }));
  await user.click(await screen.findByRole("radio"));

  const start = screen.getByLabelText("시작일");
  const end = screen.getByLabelText("종료일");
  fireEvent.input(start, { target: { value: "2026-08-15" } });
  fireEvent.input(end, { target: { value: "2026-08-14" } });
  expect(start).toHaveValue("2026-08-15");
  expect(end).toHaveValue("2026-08-14");
  const mealForm = screen
    .getByRole("button", { name: "중식 조회" })
    .closest("form");
  expect(mealForm).not.toBeNull();
  if (!mealForm) throw new Error("Meal form was not found");
  fireEvent.submit(mealForm);
  expect(
    screen.getByText("시작일은 종료일보다 늦을 수 없습니다."),
  ).toBeInTheDocument();

  fireEvent.input(start, { target: { value: "2026-08-14" } });
  await user.click(screen.getByRole("button", { name: "중식 조회" }));
  expect(await screen.findByText("현미밥")).toBeInTheDocument();

  await user.type(screen.getByLabelText("학교명"), " 변경");
  expect(screen.queryByText("현미밥")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("검색된 학교")).not.toBeInTheDocument();
});
