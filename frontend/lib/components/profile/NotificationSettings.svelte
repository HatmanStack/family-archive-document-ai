<script lang='ts'>
  export let contactEmail = ''
  export let notifyOnMessage = true
  export let notifyOnComment = true
  export let placeholderEmail = ''
  export let disabled = false
</script>

<div class='divider'>Notifications</div>

<!-- Contact Email -->
<div class='form-control'>
  <label class='label' for='contactEmail'>
    <span class='label-text font-semibold'>Contact Email (optional)</span>
  </label>
  <input
    id='contactEmail'
    type='email'
    class='input input-bordered'
    bind:value={contactEmail}
    {disabled}
    placeholder={placeholderEmail || 'Use your account email'}
  />
  <label class='label' for='contactEmail'>
    <span class='label-text-alt text-base-content/60'>
      Leave blank to use your account email for notifications
    </span>
  </label>
</div>

<!-- Message Notifications Toggle -->
<div class='form-control'>
  <label class='label cursor-pointer gap-4 justify-start'>
    <input
      type='checkbox'
      class='toggle toggle-primary'
      bind:checked={notifyOnMessage}
      {disabled}
    />
    <div>
      <span class='label-text font-semibold'>Message notifications</span>
      <p class='text-xs text-base-content/60 mt-1'>
        Get notified when someone sends you a message
      </p>
    </div>
  </label>
</div>

<!-- Comment Notifications Toggle -->
<div class='form-control'>
  <label class='label cursor-pointer gap-4 justify-start'>
    <input
      type='checkbox'
      class='toggle toggle-primary'
      bind:checked={notifyOnComment}
      {disabled}
    />
    <div>
      <span class='label-text font-semibold'>Comment notifications</span>
      <p class='text-xs text-base-content/60 mt-1'>
        Get notified when someone comments on items you've commented on
      </p>
    </div>
  </label>
</div>
