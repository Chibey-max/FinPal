import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { message: "PayPal void is not implemented yet." },
    { status: 501 },
  );
}
