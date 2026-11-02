// Shows the shape of the profile panel while it loads. No placeholder names, numbers or times.
export function ProfileSkeleton() {
  return (
    <div aria-busy="true">
      <p className="employee-profile-skeleton__status" role="status">
        Loading profile…
      </p>
      <div className="employee-profile-panel" aria-hidden="true">
        <div className="employee-profile-header">
          <span className="employee-profile-skeleton__block employee-profile-skeleton__avatar" />
          <div className="employee-profile-skeleton__summary">
            <span className="employee-profile-skeleton__block employee-profile-skeleton__line-wide" />
            <span className="employee-profile-skeleton__block employee-profile-skeleton__line" />
          </div>
        </div>
        {[0, 1, 2].map((fieldIndex) => (
          <div key={fieldIndex} className="employee-profile-skeleton__field">
            <span className="employee-profile-skeleton__block employee-profile-skeleton__label" />
            <span className="employee-profile-skeleton__block employee-profile-skeleton__input" />
          </div>
        ))}
      </div>
    </div>
  );
}
