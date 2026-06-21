import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders benefit cards from fixture domain JSON", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "서울 청년 월세 지원" })).toBeInTheDocument();
    expect(screen.getByText("국가장학금")).toBeInTheDocument();
  });

  it("renders the safety notice so users do not mistake guidance for action", () => {
    render(<App />);

    expect(
      screen.getByText(/확정 자격 판정, 로그인, 본인인증, 제출 자동화를 수행하지 않습니다/)
    ).toBeInTheDocument();
  });

  it("renders the preparation checklist items", () => {
    render(<App />);

    expect(screen.getByText("임대차계약서")).toBeInTheDocument();
  });

  it("renders the recommendation fit score on benefit cards", () => {
    render(<App />);

    expect(screen.getByText("적합도 92%")).toBeInTheDocument();
  });

  it("renders an upcoming deadlines section with KST dates", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "다가오는 신청 마감" })).toBeInTheDocument();
    expect(screen.getByText("마감일 2026-12-31")).toBeInTheDocument();
  });

  it("renders the available recommendation personas", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "추천 페르소나" })).toBeInTheDocument();
    expect(screen.getByText("youth_jobseeker")).toBeInTheDocument();
  });

  it("marks the persona applied to the current search", () => {
    render(<App />);

    const activeItem = screen.getByText("university_student").closest("li");
    expect(activeItem).toHaveTextContent("적용됨");
  });

  it("clarifies that deadlines are shown in KST", () => {
    render(<App />);

    expect(screen.getByText(/한국 시간\(KST\)/)).toBeInTheDocument();
  });

  it("exposes the generated panels as labelled regions", () => {
    render(<App />);

    expect(screen.getByRole("region", { name: "다가오는 신청 마감" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "추천 페르소나" })).toBeInTheDocument();
  });

  it("switches scenarios and recomputes the rendered results", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "서울 청년 월세 지원" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "청년 구직자" }));

    expect(screen.getByRole("heading", { name: "국민취업지원제도" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "서울 청년 월세 지원" })).not.toBeInTheDocument();
  });

  it("shows data sources with their response status", () => {
    render(<App />);

    const sources = screen.getByRole("region", { name: "데이터 출처" });
    expect(within(sources).getByText("서울특별시")).toBeInTheDocument();
    expect(within(sources).getByText("캐시")).toBeInTheDocument();
  });

  it("shows the gateway tool trace with durations", () => {
    render(<App />);

    const trace = screen.getByRole("region", { name: "도구 실행 내역" });
    expect(within(trace).getByText("searchBenefits")).toBeInTheDocument();
    expect(within(trace).getByText("42ms")).toBeInTheDocument();
  });

  it("reports a partial run when a source falls back", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "청년 구직자" }));

    expect(screen.getByText("일부 출처 대체(폴백)")).toBeInTheDocument();
  });
});
