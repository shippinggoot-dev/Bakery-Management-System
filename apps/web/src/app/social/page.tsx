"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { api } from "@/trpc/react";
import { createClientSupabase } from "@/lib/supabase/client";

const MAX_CAPTION = 2200;

function formatDate(d: Date | string) {
  return new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function ConnectPrompt() {
  const appId      = process.env.NEXT_PUBLIC_META_APP_ID;
  const redirectUri = typeof window !== "undefined"
    ? `${window.location.origin}/api/instagram/callback`
    : "";

  const oauthUrl = appId
    ? `https://www.facebook.com/v20.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement&response_type=code`
    : null;

  return (
    <div className="card p-8 text-center space-y-4 max-w-md mx-auto">
      <div className="text-5xl">📸</div>
      <h2 className="text-lg font-semibold text-gray-800">Connect Instagram</h2>
      <p className="text-sm text-gray-500">
        Link your Instagram Business or Creator account to post directly from your bakery dashboard.
      </p>
      {oauthUrl ? (
        <a
          href={oauthUrl}
          className="inline-block px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold text-sm hover:from-purple-600 hover:to-pink-600 transition-all"
        >
          Connect Instagram
        </a>
      ) : (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">Setup required</p>
          <p className="mt-1">
            Add <span className="font-mono">NEXT_PUBLIC_META_APP_ID</span> to your environment variables,
            then redeploy. See Settings → Instagram for instructions.
          </p>
        </div>
      )}
      <p className="text-xs text-gray-400">
        Requires an Instagram Business or Creator account linked to a Facebook Page.
      </p>
    </div>
  );
}

export default function SocialPage() {
  const utils = api.useUtils();
  const { data: conn, isLoading: connLoading } = api.instagram.getConnection.useQuery();
  const { data: posts = [], isLoading: postsLoading } = api.instagram.getPosts.useQuery(
    undefined,
    { enabled: conn?.connected === true },
  );
  const createPost = api.instagram.createPost.useMutation({
    onSuccess: () => {
      utils.instagram.getPosts.invalidate();
      setCaption("");
      setImageUrl("");
      setPreviewUrl(null);
    },
  });

  const [caption,    setCaption]    = useState("");
  const [imageUrl,   setImageUrl]   = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading,  setUploading]  = useState(false);
  const [uploadErr,  setUploadErr]  = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setUploadErr("Please select an image file.");
      return;
    }

    setUploading(true);
    setUploadErr(null);
    try {
      const supabase  = createClientSupabase();
      const ext       = file.name.split(".").pop() ?? "jpg";
      const path      = `posts/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("instagram-media")
        .upload(path, file, { upsert: false });

      if (uploadError) throw new Error(uploadError.message);

      const { data: { publicUrl } } = supabase.storage
        .from("instagram-media")
        .getPublicUrl(path);

      setImageUrl(publicUrl);
      setPreviewUrl(publicUrl);
    } catch (err) {
      setUploadErr(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function handlePost(e: React.FormEvent) {
    e.preventDefault();
    if (!imageUrl || !caption.trim()) return;
    createPost.mutate({ imageUrl, caption: caption.trim() });
  }

  if (connLoading) {
    return (
      <div className="space-y-4 animate-pulse max-w-2xl mx-auto">
        <div className="h-8 bg-rose-100 rounded w-40" />
        <div className="h-48 bg-rose-100 rounded-xl" />
      </div>
    );
  }

  if (!conn?.connected) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="page-title">Social</h1>
        <ConnectPrompt />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-10">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Social</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Posting as{" "}
            <span className="font-medium text-gray-700">
              {conn.igUsername ? `@${conn.igUsername}` : conn.pageName ?? "Instagram"}
            </span>
          </p>
        </div>
        <Link
          href="/settings"
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          Manage connection →
        </Link>
      </div>

      {/* Composer */}
      <div className="card p-6 space-y-5">
        <h2 className="section-title">New post</h2>

        <form onSubmit={handlePost} className="space-y-4">

          {/* Image picker */}
          <div>
            <label className="form-label">Photo</label>
            {previewUrl ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt="Post preview"
                  className="w-full max-h-72 object-cover rounded-xl border border-rose-200"
                />
                <button
                  type="button"
                  onClick={() => { setPreviewUrl(null); setImageUrl(""); if (fileRef.current) fileRef.current.value = ""; }}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 text-white text-xs flex items-center justify-center hover:bg-black/70 transition-colors"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div
                className="border-2 border-dashed border-rose-200 rounded-xl p-8 text-center cursor-pointer hover:border-brand-300 hover:bg-rose-50/50 transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                <div className="text-3xl mb-2">📷</div>
                <p className="text-sm text-gray-500">
                  {uploading ? "Uploading…" : "Click to upload a photo"}
                </p>
                <p className="text-xs text-gray-400 mt-1">JPG, PNG, WebP</p>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            {uploadErr && (
              <p className="text-xs text-red-500 mt-1">{uploadErr}</p>
            )}
          </div>

          {/* Caption */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="form-label">Caption</label>
              <span className={`text-xs ${caption.length > MAX_CAPTION * 0.9 ? "text-amber-600" : "text-gray-400"}`}>
                {caption.length} / {MAX_CAPTION}
              </span>
            </div>
            <textarea
              className="form-input resize-none"
              rows={5}
              placeholder="Write a caption… #bakery #freshbread"
              value={caption}
              maxLength={MAX_CAPTION}
              onChange={(e) => setCaption(e.target.value)}
            />
          </div>

          {createPost.error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {createPost.error.message}
            </div>
          )}

          {createPost.isSuccess && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700 font-medium">
              Posted successfully!
            </div>
          )}

          <button
            type="submit"
            disabled={!imageUrl || !caption.trim() || createPost.isPending || uploading}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold text-sm hover:from-purple-600 hover:to-pink-600 disabled:opacity-40 transition-all"
          >
            {createPost.isPending ? "Posting…" : "Post to Instagram"}
          </button>
        </form>
      </div>

      {/* Post history */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-rose-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Recent posts
        </div>

        {postsLoading ? (
          <div className="px-5 py-8 text-sm text-gray-400 text-center animate-pulse">Loading…</div>
        ) : posts.length === 0 ? (
          <div className="px-5 py-8 text-sm text-gray-400 text-center">No posts yet.</div>
        ) : (
          <div className="divide-y divide-rose-50">
            {posts.map((post) => (
              <div key={post.id} className="px-5 py-4 flex gap-4 items-start">
                {post.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={post.imageUrl}
                    alt=""
                    className="w-14 h-14 rounded-lg object-cover flex-shrink-0 border border-rose-100"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 line-clamp-2">{post.caption}</p>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${
                      post.status === "posted"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-red-50 text-red-600 border-red-200"
                    }`}>
                      {post.status === "posted" ? "Posted" : "Failed"}
                    </span>
                    <span className="text-xs text-gray-400">
                      {post.postedAt ? formatDate(post.postedAt) : formatDate(post.createdAt)}
                    </span>
                  </div>
                  {post.errorMessage && (
                    <p className="text-xs text-red-500 mt-1">{post.errorMessage}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
