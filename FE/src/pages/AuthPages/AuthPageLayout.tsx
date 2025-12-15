import React from "react";
import GridShape from "../../components/common/GridShape";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative p-6 bg-white z-1 sm:p-0">
      <div className="relative flex flex-col justify-center w-full h-screen lg:flex-row sm:p-0">
        {children}
        <div 
          className="items-center hidden w-full h-full lg:w-1/2 lg:grid bg-cover bg-center relative"
          style={{
            backgroundImage: `url('/images/logo/MKB.jpg')`,
          }}
        >
          {/* Blur overlay */}
          <div className="absolute inset-0 backdrop-blur-md bg-black/40"></div>
          <div className="relative flex items-center justify-center z-1">
            {/* <!-- ===== Common Grid Shape Start ===== --> */}
            <GridShape />
            <div className="flex flex-col items-center max-w-md">
                <div className="flex items-center gap-4">
                  <img
                    width={70}
                    height={70}
                    src="/images/logo/MKB.jpg"
                    alt="MKB logo"
                    className="rounded-lg"
                  />
                  <span className="font-bold text-4xl text-white">MKB</span>
                </div>
                <p className="mt-4 text-center text-lg text-white/80 font-medium">
                  Order and Sales Inventory Management System
                </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
