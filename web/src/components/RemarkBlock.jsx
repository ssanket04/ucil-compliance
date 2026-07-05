import React from 'react';

export default function RemarkBlock({ title, icon, content, type }) {
  const isAI = type === 'ai';
  return (
    <div className="remark-block">
      <div className="remark-header">{icon} {title}</div>
      <div className="remark-body">
        {content ? (
          <span>{content}</span>
        ) : (
          <span className="remark-placeholder">
            {isAI
              ? 'AI verdict pending — model will analyse evidence and generate verdict after submission.'
              : 'No remarks added yet.'}
          </span>
        )}
      </div>
    </div>
  );
}
