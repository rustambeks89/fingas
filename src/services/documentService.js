// [CREATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: Upload files into Storage buckets + register them in public.documents.

import { supabase } from '@/lib/supabaseClient';

export async function listDocuments({ organizationId, documentType, limit = 100 } = {}) {
  let q = supabase
    .from('documents')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (organizationId) q = q.eq('organization_id', organizationId);
  if (documentType) q = q.eq('document_type', documentType);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

// Uploads to the matching bucket and inserts a documents row.
// bucket ∈ 'receipts'|'invoices'|'tax-documents'|'measurements'|'shift-reports'|'documents'
export async function uploadDocument({
  bucket = 'documents',
  file,
  organizationId,
  stationId = null,
  documentType,
  relatedTable = null,
  relatedId = null,
  uploadedBy,
}) {
  const ext = (file.name?.split('.').pop() || 'bin').toLowerCase();
  const path = `${organizationId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(bucket)
    .upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });
  if (upErr) throw upErr;

  // Signed URL for private buckets, public URL for the avatars bucket
  let url;
  if (bucket === 'avatars') {
    url = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  } else {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, 60 * 60 * 24 * 7);
    if (error) throw error;
    url = data.signedUrl;
  }

  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .insert({
      organization_id: organizationId,
      station_id: stationId,
      document_type: documentType ?? bucket,
      file_url: url,
      file_name: file.name,
      related_table: relatedTable,
      related_id: relatedId,
      uploaded_by: uploadedBy,
    })
    .select()
    .single();
  if (docErr) throw docErr;
  return doc;
}

export async function updateDocument(id, patch) {
  const { data, error } = await supabase
    .from('documents')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteDocument(id) {
  const { error } = await supabase.from('documents').delete().eq('id', id);
  if (error) throw error;
}
