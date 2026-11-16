import { parseAmount, type PaymentForm, type PaymentStatus } from "@/lib/domain/payments";

import { supabase } from "./client";
import { permissionDenied } from "./errors";

/** Inserts one payment row and returns its id; the database policy decides whether the caller may do this. */
export async function createPayment(form: PaymentForm): Promise<string> {
  const { data, error } = await supabase
    .from("payments")
    .insert({
      student_id: form.student_id,
      amount: parseAmount(form.amount),
      payment_date: form.payment_date,
      description: form.description.trim() || null,
      status: form.status,
    })
    .select("id");
  if (error) throw error;
  const id = data?.[0]?.id;
  if (!id) throw permissionDenied();
  return String(id);
}

export async function updatePaymentStatus(id: string, status: PaymentStatus) {
  const { data, error } = await supabase
    .from("payments")
    .update({ status })
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw permissionDenied();
}
