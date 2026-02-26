'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { motion, useReducedMotion } from 'framer-motion';
import {
    Facebook,
    Instagram,
    Linkedin,
    Youtube,
    Pill,
} from 'lucide-react';
import { Button } from './button';
import Link from 'next/link';

interface FooterLink {
    title: string;
    href: string;
    icon?: React.ComponentType<{ className?: string }>;
}

interface FooterLinkGroup {
    label: string;
    links: FooterLink[];
}

type StickyFooterProps = React.ComponentProps<'footer'>;

export function StickyFooter({ className, ...props }: StickyFooterProps) {
    return (
        <footer
            className={cn('relative h-[720px] w-full', className)}
            style={{ clipPath: 'polygon(0% 0, 100% 0%, 100% 100%, 0 100%)' }}
            {...props}
        >
            <div className="fixed bottom-0 h-[720px] w-full">
                <div className="sticky top-[calc(100vh-720px)] h-full overflow-y-auto">
                    <div className="relative flex size-full flex-col justify-between gap-5 border-t bg-zinc-950 px-4 py-8 md:px-12">
                        <div
                            aria-hidden
                            className="absolute inset-0 isolate z-0 contain-strict"
                        >
                            <div className="bg-[radial-gradient(68.54%_68.72%_at_55.02%_31.46%,rgba(6,182,212,0.15)_0,hsla(0,0%,55%,.02)_50%,rgba(6,182,212,0.05)_80%)] absolute top-0 left-0 h-320 w-140 -translate-y-87.5 -rotate-45 rounded-full" />
                            <div className="bg-[radial-gradient(50%_50%_at_50%_50%,rgba(59,130,246,0.1)_0,rgba(59,130,246,0.02)_80%,transparent_100%)] absolute top-0 left-0 h-320 w-60 [translate:5%_-50%] -rotate-45 rounded-full" />
                        </div>
                        <div className="mt-10 flex flex-col gap-8 md:flex-row xl:mt-0">
                            <AnimatedContainer className="w-full max-w-sm min-w-2xs space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                                        <Pill className="h-5 w-5 text-white" />
                                    </div>
                                    <span className="font-[family-name:var(--font-display)] text-2xl font-bold text-white">
                                        MediRep<span className="text-cyan-400">AI</span>
                                    </span>
                                </div>
                                <p className="text-zinc-400 mt-8 text-sm md:mt-0">
                                    AI-powered medical intelligence platform for drug information,
                                    interactions, pill identification, and expert consultations.
                                </p>
                                <div className="flex gap-2">
                                    {socialLinks.map((link, i) => (
                                        <Button key={i} size="icon" variant="outline" className="size-8 border-zinc-700 bg-zinc-900 hover:bg-zinc-800 hover:border-cyan-500/50">
                                            <link.icon className="size-4 text-zinc-400" />
                                        </Button>
                                    ))}
                                </div>
                            </AnimatedContainer>
                            {footerLinkGroups.map((group, index) => (
                                <AnimatedContainer
                                    key={group.label}
                                    delay={0.1 + index * 0.1}
                                    className="w-full"
                                >
                                    <div className="mb-10 md:mb-0">
                                        <h3 className="text-sm uppercase text-white font-semibold">{group.label}</h3>
                                        <ul className="text-zinc-400 mt-4 space-y-2 text-sm md:text-xs lg:text-sm">
                                            {group.links.map((link) => (
                                                <li key={link.title}>
                                                    <Link
                                                        href={link.href}
                                                        className="hover:text-cyan-400 inline-flex items-center transition-all duration-300"
                                                    >
                                                        {link.icon && <link.icon className="me-1 size-4" />}
                                                        {link.title}
                                                    </Link>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </AnimatedContainer>
                            ))}
                        </div>
                        <div className="text-zinc-500 flex flex-col items-center justify-between gap-2 border-t border-zinc-800 pt-4 text-sm md:flex-row">
                            <p>© 2025 MediRep AI. All rights reserved.</p>
                            <p className="text-cyan-400/60">Built for better healthcare</p>
                        </div>
                    </div>
                </div>
            </div>
        </footer>
    );
}

const socialLinks = [
    { title: 'Facebook', href: '#', icon: Facebook },
    { title: 'Instagram', href: '#', icon: Instagram },
    { title: 'Youtube', href: '#', icon: Youtube },
    { title: 'LinkedIn', href: '#', icon: Linkedin },
];

const footerLinkGroups: FooterLinkGroup[] = [
    {
        label: 'Features',
        links: [
            { title: 'AI Chat Assistant', href: '#' },
            { title: 'Drug Interactions', href: '#' },
            { title: 'Pill Scanner', href: '#' },
            { title: 'Safety Alerts', href: '#' },
            { title: 'Pharmacist Connect', href: '#' },
        ],
    },
    {
        label: 'Resources',
        links: [
            { title: 'Documentation', href: '#' },
            { title: 'API Reference', href: '#' },
            { title: 'Drug Database', href: '#' },
            { title: 'Medical FAQs', href: '#' },
            { title: 'Help Center', href: '#' },
        ],
    },
    {
        label: 'Company',
        links: [
            { title: 'About Us', href: '#' },
            { title: 'Careers', href: '#' },
            { title: 'Contact', href: '#' },
            { title: 'Privacy Policy', href: '/privacy' },
            { title: 'Terms of Service', href: '/terms' },
        ],
    },
];

type AnimatedContainerProps = React.ComponentProps<typeof motion.div> & {
    children?: React.ReactNode;
    delay?: number;
};

function AnimatedContainer({
    delay = 0.1,
    children,
    ...props
}: AnimatedContainerProps) {
    const shouldReduceMotion = useReducedMotion();

    if (shouldReduceMotion) {
        return <>{children}</>;
    }

    return (
        <motion.div
            initial={{ filter: 'blur(4px)', translateY: -8, opacity: 0 }}
            whileInView={{ filter: 'blur(0px)', translateY: 0, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay, duration: 0.8 }}
            {...props}
        >
            {children}
        </motion.div>
    );
}

export default StickyFooter;
