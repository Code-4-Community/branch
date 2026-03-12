'use client';
import { TextEntry } from "../TextEntry";

export const ResetPasswordForm = () => {
  return (
    <div className="flex flex-col items-center px-8 gap-[30px]">
      <h1 className="text-black leading-none tracking-normal">Reset Password</h1>

      <div className="flex flex-col gap-2">
        <small className="text-core-black">
          New Password <span className="text-error-red">*</span>
        </small>
        <TextEntry type="password" placeholder="Enter password" />
      </div>

      <div className="flex flex-col gap-2">
        <small className="text-core-black">
          Confirm Password <span className="text-error-red">*</span>
        </small>
        <TextEntry type="password" placeholder="Enter password" />
      </div>

      <button className="bg-core-green text-core-white font-body font-bold w-full h-13 rounded hover:opacity-90">
        Reset password
      </button>
    </div>
  );
};