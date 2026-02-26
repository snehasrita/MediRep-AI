"use client";

import { cn } from "@/lib/utils";
import Link, { LinkProps } from "next/link";
import React, { useState, createContext, useContext } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X, PanelLeft } from "lucide-react";

interface Links {
  label: string;
  href: string;
  icon: React.JSX.Element | React.ReactNode;
}

interface SidebarContextProps {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  animate: boolean;
}

const SidebarContext = createContext<SidebarContextProps | undefined>(
  undefined
);

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
};

export const SidebarProvider = ({
  children,
  open: openProp,
  setOpen: setOpenProp,
  animate = true,
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
}) => {
  const [openState, setOpenState] = useState(false);

  const open = openProp !== undefined ? openProp : openState;
  const setOpen = setOpenProp !== undefined ? setOpenProp : setOpenState;

  return (
    <SidebarContext.Provider value={{ open, setOpen, animate }}>
      {children}
    </SidebarContext.Provider>
  );
};

export const Sidebar = ({
  children,
  open,
  setOpen,
  animate,
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
}) => {
  return (
    <SidebarProvider open={open} setOpen={setOpen} animate={animate}>
      {children}
    </SidebarProvider>
  );
};

export const SidebarBody = (props: React.ComponentProps<typeof motion.div>) => {
  return (
    <>
      <DesktopSidebar {...props} />
      <MobileSidebar {...(props as React.ComponentProps<"div">)} />
    </>
  );
};

export const DesktopSidebar = ({
  className,
  children,
  ...props
}: React.ComponentProps<typeof motion.div>) => {
  const { open, setOpen, animate } = useSidebar();
  return (
    <motion.div
      className={cn(
        "h-full px-4 py-4 hidden md:flex md:flex-col bg-[color:var(--landing-card-strong)] backdrop-blur-xl border-r border-[color:var(--landing-border)] w-[280px] flex-shrink-0",
        className
      )}
      animate={{
        width: animate ? (open ? "280px" : "70px") : "280px",
      }}
      transition={{
        duration: 0.3,
        ease: [0.25, 0.4, 0.25, 1],
      }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      {...props}
    >
      {children}
    </motion.div>
  );
};

export const MobileSidebar = ({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) => {
  const { open, setOpen } = useSidebar();
  return (
    <>
      <div
        className={cn(
          "h-14 px-4 flex flex-row md:hidden items-center justify-between bg-[color:var(--landing-card-strong)] backdrop-blur-xl border-b border-[color:var(--landing-border)] w-full"
        )}
        {...props}
      >
        <div className="flex justify-end z-20 w-full">
          <Menu
            className="text-[color:var(--landing-ink)] cursor-pointer h-6 w-6"
            onClick={() => setOpen(!open)}
          />
        </div>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ x: "-100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "-100%", opacity: 0 }}
              transition={{
                duration: 0.3,
                ease: "easeInOut",
              }}
              className={cn(
                "fixed h-full w-full inset-0 bg-[color:var(--landing-paper)] p-6 z-[100] flex flex-col justify-between",
                className
              )}
            >
              <div
                className="absolute right-6 top-6 z-50 text-[color:var(--landing-ink)] cursor-pointer"
                onClick={() => setOpen(!open)}
              >
                <X className="h-6 w-6" />
              </div>
              {children}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
};

export const SidebarLink = ({
  link,
  className,
  isActive,
  onClick,
  ...props
}: {
  link: Links;
  className?: string;
  isActive?: boolean;
  onClick?: () => void;
  props?: LinkProps;
}) => {
  const { open, animate } = useSidebar();
  return (
    <Link
      href={link.href}
      onClick={onClick}
      className={cn(
        "relative flex items-center justify-start gap-3 group/sidebar py-3 px-3 rounded-xl transition-all duration-200",
        !open && "justify-center px-0",
        isActive
          ? "bg-[rgb(var(--landing-clay-rgb)/0.14)] text-[color:var(--landing-ink)] border border-[rgb(var(--landing-clay-rgb)/0.32)]"
          : "hover:bg-[rgb(var(--landing-dot-rgb)/0.06)] text-[color:var(--landing-muted)] hover:text-[color:var(--landing-ink)]",
        className
      )}
      {...props}
    >
      <span className={cn(
        "flex-shrink-0 transition-colors duration-200",
        isActive ? "text-[color:var(--landing-clay)]" : "text-[color:var(--landing-muted-2)] group-hover/sidebar:text-[color:var(--landing-ink)]"
      )}>
        {link.icon}
      </span>
      <motion.span
        animate={{
          display: animate ? (open ? "inline-block" : "none") : "inline-block",
          opacity: animate ? (open ? 1 : 0) : 1,
        }}
        className="text-sm font-medium whitespace-pre inline-block !p-0 !m-0 transition duration-150"
      >
        {link.label}
      </motion.span>
    </Link>
  );
};

export const SidebarLogo = ({
  open,
  icon,
  title,
  subtitle,
}: {
  open: boolean;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}) => {
  return (
    <Link
      href="/"
      className={cn(
        "font-normal flex items-center gap-3 text-sm py-1 relative z-20 w-full",
        !open && "justify-center gap-0"
      )}
    >
      <motion.div
        className="h-10 w-10 rounded-xl bg-[color:var(--landing-clay)] flex items-center justify-center shadow-lg shadow-[rgb(var(--landing-clay-rgb)/0.25)] flex-shrink-0"
        whileHover={{ scale: 1.05, rotate: 5 }}
        transition={{ type: "spring", stiffness: 400 }}
      >
        {icon}
      </motion.div>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col"
          >
            <span className="font-bold text-zinc-900 dark:text-white whitespace-pre font-[family-name:var(--font-display)]">
              {title}
            </span>
            {subtitle && (
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {subtitle}
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Link>
  );
};

export const SidebarTrigger = ({
  className,
  onClick,
  ...props
}: React.ComponentProps<"button">) => {
  const { open, setOpen } = useSidebar();
  return (
    <button
      className={cn(
        "h-7 w-7 text-[color:var(--landing-muted)] hover:text-[color:var(--landing-ink)] transition-colors",
        className
      )}
      onClick={(e) => {
        onClick?.(e);
        setOpen(!open);
      }}
      {...props}
    >
      <PanelLeft className="h-5 w-5" />
      <span className="sr-only">Toggle Sidebar</span>
    </button>
  );
};
