import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { message: "Proposal creation is not implemented yet." },
    { status: 501 },
  );
}
