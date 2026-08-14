export interface School {
  educationOfficeCode: string;
  schoolCode: string;
  name: string;
  educationOfficeName: string | null;
  location: string | null;
  schoolType: string | null;
}

export interface Meal {
  date: string;
  mealType: string;
  menu: string[];
  calories: string | null;
  nutrition: string | null;
  origin: string | null;
  headcount: number | null;
}

export interface MealResponse {
  school: School;
  meals: Meal[];
}

interface ErrorResponse {
  code: string;
  message: string;
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal,
  });

  if (!response.ok) {
    let error: ErrorResponse = {
      code: "REQUEST_FAILED",
      message: "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
    try {
      const body: unknown = await response.json();
      if (
        typeof body === "object" &&
        body !== null &&
        "code" in body &&
        "message" in body &&
        typeof body.code === "string" &&
        typeof body.message === "string"
      ) {
        error = { code: body.code, message: body.message };
      }
    } catch {
      // The stable fallback above is used for non-JSON server failures.
    }
    throw new ApiClientError(error.message, error.code, response.status);
  }

  return response.json() as Promise<T>;
}

export function searchSchools(
  query: string,
  signal?: AbortSignal,
): Promise<School[]> {
  const params = new URLSearchParams({ query });
  return request<School[]>(`/api/schools?${params.toString()}`, signal);
}

export function getMeals(
  school: School,
  dateFrom: string,
  dateTo: string,
  signal?: AbortSignal,
): Promise<MealResponse> {
  const office = encodeURIComponent(school.educationOfficeCode);
  const schoolCode = encodeURIComponent(school.schoolCode);
  const params = new URLSearchParams({ from: dateFrom, to: dateTo });
  return request<MealResponse>(
    `/api/schools/${office}/${schoolCode}/meals?${params.toString()}`,
    signal,
  );
}
