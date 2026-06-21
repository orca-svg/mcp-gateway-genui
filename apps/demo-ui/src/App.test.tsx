import { render, screen } from "@testing-library/react";
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
});
