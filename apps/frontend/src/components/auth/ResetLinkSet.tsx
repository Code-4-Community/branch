'use client';
import { Button } from "@chakra-ui/react";

export const ResetLinkSet = () => {
  return (
    <div className="flex flex-col justify-center w-full h-full px-20 gap-6">
      <h1>Password changed</h1>

      <p className="font-bold text-core-black">
        Your password has been successfully changed!
      </p>

      <Button
        bg="#2D6138"
        color="white"
        fontWeight="bold"
        width="100%"
        height="52px"
        _hover={{ bg: "#245a42" }}
        borderRadius="md"
      >
        Back to login
      </Button>
    </div>
  );
};