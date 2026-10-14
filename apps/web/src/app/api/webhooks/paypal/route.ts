import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { message: "PayPal webhook verification is not implemented yet." },
    { status: 501 },
  );
}
