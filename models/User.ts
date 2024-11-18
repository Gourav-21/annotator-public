// models/User.ts
import mongoose, { Schema, model, models } from "mongoose";

const userSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    domain: [
      {
        type: String,
        default: [],
      },
    ],
    location: {
      type: String,
      default: null,
    },
    phone: {
      type: String,
      default: null,
    },
    lang: [
      {
        type: String,
        default: [],
      },
    ],
    role: {
      type: String,
      enum: ["project manager", "annotator"],
      required: true,
    },
    invitation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invitation",
      default: null,
    },
    linkedin: {
      type: String,
      default: null,
    },
    resume: {
      type: String,
      default: null,
    },
    nda: {
      type: String,
      default: null,
    },
    permission: {
      type: [String],
      enum: ["canReview"],
      default: [],
    },
    lastLogin: {
      type: Date,
      default: Date.now,
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
    updated_at: {
      type: Date,
      default: Date.now,
    },
  },
  {
    // Add timestamps for created_at and updated_at fields
    timestamps: {
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
    minimize: false,
  }
);

// Add pre-save middleware to update the updated_at field
userSchema.pre("save", function (next) {
  this.updated_at = new Date();
  next();
});

export const User = models?.User || model("User", userSchema);
