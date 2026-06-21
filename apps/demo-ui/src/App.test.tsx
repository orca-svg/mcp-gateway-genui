import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders benefit cards from fixture domain JSON", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "서울 청년 월세 지원" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "국가장학금" })).toBeInTheDocument();
  });

  it("renders score bars and score breakdown from fixture domain JSON", () => {
    render(<App />);

    expect(screen.getAllByLabelText("추천 점수 92점")).toHaveLength(2);
    expect(screen.getByText(/청년 연령대 조건과 일치합니다/)).toBeInTheDocument();
  });

  it("renders persona selection from listPersonas fixture data", () => {
    render(<App />);

    expect(screen.getByRole("button", { name: /대학생/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /청년 구직자/ })).toBeInTheDocument();
  });

  it("renders upcoming deadlines with scores", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "다가오는 신청 마감 (60일)" })).toBeInTheDocument();
    expect(screen.getAllByText(/마감:/)).toHaveLength(2);
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
});
