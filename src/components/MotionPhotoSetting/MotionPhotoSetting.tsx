import React, {useCallback} from 'react';
import Button from '@enact/sandstone/Button';
import {useMotionAutoplay} from '../../utils/motionPhotoStore';
import css from '../SettingsSection.module.less';

// Settings: whether live and motion photos play their video when opened in the viewer.
export const MotionPhotoSetting: React.FC = () => {
	const [autoplay, setAutoplay] = useMotionAutoplay();
	const playOnOpen = useCallback(() => setAutoplay(true), [setAutoplay]);
	const playOnButton = useCallback(() => setAutoplay(false), [setAutoplay]);

	return (
		<section className={css.section}>
			<h4 className={css.heading}>Live and motion photos</h4>
			<div className={css.options}>
				<Button size="small" icon={autoplay ? 'check' : undefined} selected={autoplay} aria-pressed={autoplay} onClick={playOnOpen}>
					Play when opened
				</Button>
				<Button size="small" icon={autoplay ? undefined : 'check'} selected={!autoplay} aria-pressed={!autoplay} onClick={playOnButton}>
					Play with the Live button only
				</Button>
			</div>
		</section>
	);
};

MotionPhotoSetting.displayName = 'MotionPhotoSetting';
