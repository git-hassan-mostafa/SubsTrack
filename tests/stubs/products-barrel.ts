// The real `@/src/modules/admin/products` barrel exports four screens, and its
// service reaches the tier/subscription graph — importing it drags React and a
// native NetInfo module into a unit test. Only the mapper is ever needed here.
export { mapDbProductToProduct } from '@/src/modules/admin/products/utils/mapper';
