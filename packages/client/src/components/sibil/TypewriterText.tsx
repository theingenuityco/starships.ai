'use client'

import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { useTypewriter } from '@/hooks/useTypewriter';
import type { TypewriterChunk } from '@/types';

interface TypewriterTextProps {
  chunks: TypewriterChunk[];
  speed?: number;
  enabled?: boolean;
  onComplete?: () => void;
  className?: string;
}

export function TypewriterText({
  chunks,
  speed = 75,
  enabled = true,
  onComplete,
  className = ''
}: TypewriterTextProps) {
  const {
    displayText,
    isTyping,
    progress,
    addChunk,
    reset
  } = useTypewriter({
    speed,
    enabled,
    onComplete
  });

  const processedChunksRef = useRef(new Set<string>());

  useEffect(() => {
    chunks.forEach((chunk, index) => {
      const chunkKey = `${index}-${chunk.position}`;
      if (!processedChunksRef.current.has(chunkKey)) {
        processedChunksRef.current.add(chunkKey);
        addChunk(chunk);
      }
    });
  }, [chunks, addChunk]);

  useEffect(() => {
    if (chunks.length === 0) {
      reset();
      processedChunksRef.current.clear();
    }
  }, [chunks.length, reset]);

  return (
    <motion.div
      className={`relative ${className}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <span className="whitespace-pre-wrap">{displayText}</span>
      
      {isTyping && (
        <motion.span
          className="inline-block w-0.5 h-4 bg-current ml-0.5"
          animate={{ opacity: [1, 0, 1] }}
          transition={{
            duration: 1,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
      )}
      
      {isTyping && progress > 0 && (
        <motion.div
          className="absolute -bottom-1 left-0 h-0.5 bg-blue-500 rounded"
          style={{ width: `${progress * 100}%` }}
          initial={{ width: 0 }}
          animate={{ width: `${progress * 100}%` }}
          transition={{ duration: 0.1 }}
        />
      )}
    </motion.div>
  );
}