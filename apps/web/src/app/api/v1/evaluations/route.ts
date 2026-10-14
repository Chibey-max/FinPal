import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { message: "Evaluation orchestration is not implemented yet." },
    { status: 501 },
  );
}
