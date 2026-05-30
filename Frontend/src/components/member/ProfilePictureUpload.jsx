import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, Trash2, User } from "lucide-react";
import { cn } from "../../utils/cn.js";
import { MEMBER_QUERY_KEYS } from "../../services/member.service.js";
import memberService from "../../services/member.service.js";

export default function ProfilePictureUpload({ currentUrl }) {
  const fileInputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: (file) => memberService.uploadProfilePicture(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MEMBER_QUERY_KEYS.profile });
      toast.success("Profile picture updated.");
      setPreview(null);
    },
    onError: (err) => {
      toast.error(err?.message ?? "Failed to upload picture.");
      setPreview(null);
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => memberService.removeProfilePicture(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MEMBER_QUERY_KEYS.profile });
      toast.success("Profile picture removed.");
    },
    onError: () => toast.error("Failed to remove picture."),
  });

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side size check
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB.");
      return;
    }

    // Show preview immediately
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target.result);
    reader.readAsDataURL(file);

    uploadMutation.mutate(file);
    // Reset input so same file can be re-selected
    e.target.value = "";
  };

  const displayUrl = preview || currentUrl;
  const isLoading = uploadMutation.isPending || removeMutation.isPending;

  return (
    <div className="flex items-center gap-5">
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-gray-200 bg-gray-100 flex items-center justify-center">
          {displayUrl ? (
            <img
              src={displayUrl}
              alt="Profile"
              className="w-full h-full object-cover"
            />
          ) : (
            <User className="w-8 h-8 text-gray-400" />
          )}
        </div>

        {/* Upload overlay button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
          className={cn(
            "absolute -bottom-1 -right-1 w-7 h-7 rounded-full",
            "bg-gray-900 text-white border-2 border-white",
            "flex items-center justify-center",
            "hover:bg-gray-700 transition-colors duration-150",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
            isLoading && "opacity-50 cursor-not-allowed",
          )}
          aria-label="Upload profile picture"
        >
          {isLoading ? (
            <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Camera className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Actions */}
      <div>
        <p className="font-body text-sm font-medium text-gray-900 mb-1">
          Profile Picture
        </p>
        <p className="font-body text-xs text-gray-400 mb-3">
          JPEG, PNG or WebP · Max 5MB · Cropped to square
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg",
              "font-body text-xs font-medium border border-gray-200",
              "bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-300",
              "transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400",
              isLoading && "opacity-50 cursor-not-allowed",
            )}
          >
            <Camera className="w-3 h-3" />
            {currentUrl ? "Change" : "Upload"}
          </button>

          {currentUrl && (
            <button
              type="button"
              onClick={() => removeMutation.mutate()}
              disabled={isLoading}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg",
                "font-body text-xs font-medium border border-red-200",
                "bg-white text-red-500 hover:bg-red-50 hover:border-red-300",
                "transition-colors duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400",
                isLoading && "opacity-50 cursor-not-allowed",
              )}
            >
              <Trash2 className="w-3 h-3" />
              Remove
            </button>
          )}
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        className="hidden"
        aria-hidden="true"
      />
    </div>
  );
}
