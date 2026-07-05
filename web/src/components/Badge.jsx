import React from 'react';

export default function Badge({ text, color = 'gray' }) {
  return <span className={`badge badge-${color}`}>{text}</span>;
}
