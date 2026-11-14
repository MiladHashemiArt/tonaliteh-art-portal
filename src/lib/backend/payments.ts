import { parseAmount, type PaymentForm, type PaymentStatus } from "@/lib/domain/payments";

import { supabase } from "./client";
import { permissionDenied } from "./errors";

/** Inserts one payment row; the database policy decides whether the caller may do this. */
export async function createPayment(form: PaymentForm) {
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
  if (!data?.length) throw permissionDenied();
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
