import { useState, useCallback } from 'react';

export const useModal = (initialState = false) => {
  const [isOpen, setIsOpen] = useState(initialState);

  const openModal = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggleModal = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  return {
    isOpen,
    openModal,
    closeModal,
    toggleModal
  };
};

export const useConfirmationModal = () => {
  const [modalState, setModalState] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    type: 'warning',
    onConfirm: null
  });

  const showConfirmation = useCallback(({
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    type = 'warning',
    onConfirm
  }) => {
    setModalState({
      isOpen: true,
      title,
      message,
      confirmText,
      cancelText,
      type,
      onConfirm
    });
  }, []);

  const hideConfirmation = useCallback(() => {
    setModalState(prev => ({ ...prev, isOpen: false }));
  }, []);

  const handleConfirm = useCallback(() => {
    if (modalState.onConfirm) {
      modalState.onConfirm();
    }
    hideConfirmation();
  }, [modalState, hideConfirmation]);

  return {
    modalState,
    showConfirmation,
    hideConfirmation,
    handleConfirm
  };
};

export const useInputModal = () => {
  const [modalState, setModalState] = useState({
    isOpen: false,
    title: '',
    label: '',
    placeholder: '',
    submitText: 'Submit',
    cancelText: 'Cancel',
    initialValue: '',
    required: false,
    onSubmit: null
  });

  const showInputModal = useCallback(({
    title,
    label,
    placeholder = '',
    submitText = 'Submit',
    cancelText = 'Cancel',
    initialValue = '',
    required = false,
    onSubmit
  }) => {
    setModalState({
      isOpen: true,
      title,
      label,
      placeholder,
      submitText,
      cancelText,
      initialValue,
      required,
      onSubmit
    });
  }, []);

  const hideInputModal = useCallback(() => {
    setModalState(prev => ({ ...prev, isOpen: false }));
  }, []);

  const handleSubmit = useCallback((value) => {
    if (modalState.onSubmit) {
      modalState.onSubmit(value);
    }
    hideInputModal();
  }, [modalState, hideInputModal]);

  return {
    modalState,
    showInputModal,
    hideInputModal,
    handleSubmit
  };
};
