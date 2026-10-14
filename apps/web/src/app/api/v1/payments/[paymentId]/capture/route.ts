import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { message: "PayPal capture is not implemented yet." },
    { status: 501 },
  );
}
