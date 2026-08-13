import React, { useEffect, useState } from 'react';
import { Dice5, Save, Skull } from 'lucide-react';
import { API_URL } from '../config';
import { invalidateCache } from '../utils/apiCache';
import { fetchWithUserSession } from '../utils/userSession';
import {
  AVATAR_CHARACTERS,
  AVATAR_EYES,
  AVATAR_PATTERNS,
  AVATAR_SLIDERS,
  avatarConfigsEqual,
  cursedAvatarConfig,
  normalizeAvatarConfig,
  randomAvatarConfig,
} from '../utils/avatarConfig';
import SquidAvatar from './SquidAvatar';
import './AvatarCustomizer.css';

const BASE_SHAPE_SLIDERS = ['width', 'height', 'roundness'];
const SQUID_SHAPE_SLIDERS = ['tentacleSpread', 'tentacleLength'];

function AvatarSlider({ configKey, value, onChange }) {
  const slider = AVATAR_SLIDERS[configKey];
  const progress = ((value - slider.min) / (slider.max - slider.min)) * 100;
  return (
    <label className="avatar-customizer__slider">
      <span className="avatar-customizer__slider-label">
        <span>{slider.label}</span>
        <output>{value}</output>
      </span>
      <input
        type="range"
        min={slider.min}
        max={slider.max}
        step={slider.step}
        value={value}
        onChange={(event) => onChange(configKey, Number(event.target.value))}
        style={{ '--slider-progress': `${progress}%` }}
        aria-label={slider.label}
      />
    </label>
  );
}

function AvatarColorControl({ configKey, label, value, onChange }) {
  return (
    <label className="avatar-customizer__color-control">
      <span>{label}</span>
      <span className="avatar-customizer__color-input-row">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(configKey, event.target.value.toUpperCase())}
          aria-label={`${label} color`}
        />
        <output>{value}</output>
      </span>
    </label>
  );
}

function AvatarOptions({ groupKey, label, options, draftConfig, onChoose }) {
  return (
    <div className="avatar-customizer__option-grid">
      {options.map((option) => {
        const selected = draftConfig[groupKey] === option.id;
        const previewConfig = { ...draftConfig, [groupKey]: option.id };
        return (
          <button
            type="button"
            key={option.id}
            className={`avatar-customizer__option${selected ? ' is-selected' : ''}`}
            onClick={() => onChoose(groupKey, option.id)}
            aria-pressed={selected}
            aria-label={`${label}: ${option.label}`}
          >
            <span className="avatar-customizer__option-preview">
              <SquidAvatar config={previewConfig} decorative />
            </span>
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function AvatarCustomizer({ userId, value, onChange }) {
  const [savedConfig, setSavedConfig] = useState(() => normalizeAvatarConfig(value));
  const [draftConfig, setDraftConfig] = useState(() => normalizeAvatarConfig(value));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const hasChanges = !avatarConfigsEqual(draftConfig, savedConfig);

  useEffect(() => {
    const normalized = normalizeAvatarConfig(value);
    setSavedConfig(normalized);
    setDraftConfig(normalized);
  }, [value]);

  const chooseOption = (key, optionValue) => {
    setMessage('');
    setDraftConfig((current) => ({ ...current, [key]: optionValue }));
  };

  const handleSave = async () => {
    if (!hasChanges || saving) return;
    setSaving(true);
    setMessage('');
    try {
      const response = await fetchWithUserSession(`${API_URL}/user/${encodeURIComponent(userId)}/avatar`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar_config: draftConfig }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save your avatar');
      const normalized = normalizeAvatarConfig(data.avatar_config);
      setSavedConfig(normalized);
      setDraftConfig(normalized);
      invalidateCache(`profile:${userId}:v3`);
      setMessage('Avatar saved');
      onChange?.(normalized);
    } catch (error) {
      setMessage(error.message || 'Could not save your avatar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="avatar-customizer" aria-labelledby="avatar-customizer-title">
      <div className="avatar-customizer__preview-panel">
        <div className="avatar-customizer__heading-row">
          <div>
            <span className="avatar-customizer__eyebrow">Your avatar</span>
            <h3 id="avatar-customizer-title" className="app-subsection-heading">Build your avatar</h3>
          </div>
          <div className="avatar-customizer__quick-actions">
            <button
              type="button"
              className="avatar-customizer__icon-button avatar-customizer__icon-button--cursed"
              onClick={() => { setDraftConfig(cursedAvatarConfig()); setMessage(''); }}
              aria-label="Make avatar cursed"
              title="Make it cursed"
            >
              <Skull size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="avatar-customizer__icon-button"
              onClick={() => { setDraftConfig(randomAvatarConfig()); setMessage(''); }}
              aria-label="Randomize avatar"
              title="Randomize avatar"
            >
              <Dice5 size={19} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="avatar-customizer__preview" aria-live="polite">
          <SquidAvatar config={draftConfig} title="Your customized avatar preview" animated />
        </div>
        <button
          type="button"
          className="avatar-customizer__save"
          onClick={handleSave}
          disabled={!hasChanges || saving}
        >
          <Save size={17} aria-hidden="true" />
          {saving ? 'Saving…' : 'Save avatar'}
        </button>
        {message && (
          <div className={`avatar-customizer__message${message === 'Avatar saved' ? ' is-success' : ' is-error'}`} role="status">
            {message}
          </div>
        )}
      </div>

      <div className="avatar-customizer__controls">
        <fieldset className="avatar-customizer__group">
          <legend>Character</legend>
          <AvatarOptions
            groupKey="character"
            label="Character"
            options={AVATAR_CHARACTERS}
            draftConfig={draftConfig}
            onChoose={chooseOption}
          />
        </fieldset>

        <fieldset className="avatar-customizer__group">
          <legend>Colors</legend>
          <div className="avatar-customizer__color-grid">
            <AvatarColorControl configKey="color" label="Body" value={draftConfig.color} onChange={chooseOption} />
            <AvatarColorControl configKey="eyeColor" label="Eyes" value={draftConfig.eyeColor} onChange={chooseOption} />
            <AvatarColorControl configKey="patternColor" label="Pattern" value={draftConfig.patternColor} onChange={chooseOption} />
          </div>
        </fieldset>

        <fieldset className="avatar-customizer__group">
          <legend>Shape</legend>
          <div className="avatar-customizer__slider-grid">
            {[...BASE_SHAPE_SLIDERS, ...(draftConfig.character === 'squid' ? SQUID_SHAPE_SLIDERS : [])].map((configKey) => (
              <AvatarSlider key={configKey} configKey={configKey} value={draftConfig[configKey]} onChange={chooseOption} />
            ))}
          </div>
        </fieldset>

        <fieldset className="avatar-customizer__group">
          <legend>Eyes</legend>
          <div className="avatar-customizer__eye-controls">
            <AvatarSlider configKey="eyeSpacing" value={draftConfig.eyeSpacing} onChange={chooseOption} />
            <AvatarOptions
              groupKey="eyes"
              label="Eye style"
              options={AVATAR_EYES}
              draftConfig={draftConfig}
              onChoose={chooseOption}
            />
          </div>
        </fieldset>

        <fieldset className="avatar-customizer__group">
          <legend>Pattern</legend>
          <AvatarOptions
            groupKey="pattern"
            label="Pattern"
            options={AVATAR_PATTERNS}
            draftConfig={draftConfig}
            onChoose={chooseOption}
          />
        </fieldset>

        <fieldset className="avatar-customizer__group">
          <legend>Scale &amp; motion</legend>
          <div className="avatar-customizer__slider-grid avatar-customizer__slider-grid--two">
            <AvatarSlider configKey="size" value={draftConfig.size} onChange={chooseOption} />
            <AvatarSlider configKey="motion" value={draftConfig.motion} onChange={chooseOption} />
          </div>
        </fieldset>
      </div>
    </section>
  );
}

export default AvatarCustomizer;
